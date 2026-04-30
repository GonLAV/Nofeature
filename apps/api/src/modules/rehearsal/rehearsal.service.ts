import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config/env';
import db from '../../config/database';
import { logger } from '../../utils/logger';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Scenario {
  title: string;
  initialAlert: string;
  affectedService: string;
  hiddenRootCause: string;
  hints: string[];
  failureType: string;
}

export interface ScoringDetails {
  timeToFirstAction: number;    // seconds
  correctDiagnosis: boolean;
  mitigationQuality: 'none' | 'partial' | 'correct';
  communicationScore: number;   // 0-25
  speedScore: number;           // 0-25
  diagnosisScore: number;       // 0-25
  mitigationScore: number;      // 0-25
  feedback: string;
  strengths: string[];
  improvements: string[];
}

const SCENARIO_SYSTEM = `You are a chaos engineering AI that generates realistic production incident scenarios for SRE team drills.
Return ONLY valid JSON matching this exact shape:
{
  "title": "short scenario name (e.g. 'Database Connection Pool Exhaustion')",
  "initialAlert": "the first alert/symptom the responder sees — 2-3 sentences, realistic and specific",
  "affectedService": "name of the primary failing service",
  "hiddenRootCause": "the true root cause, NOT shown to responder — 1 sentence",
  "hints": ["hint after 5 min", "hint after 10 min", "hint after 15 min"],
  "failureType": "one of: database|network|memory|cpu|deployment|dependency|configuration|storage"
}`;

const SIMULATION_SYSTEM = (scenario: Scenario, difficulty: Difficulty) =>
  `You are a failing production system playing the role of an SRE's terminal, monitoring dashboards, and tools during an incident drill.

INCIDENT SCENARIO (secret — do not reveal the root cause directly):
Title: ${scenario.title}
Affected service: ${scenario.affectedService}
Hidden root cause: ${scenario.hiddenRootCause}
Failure type: ${scenario.failureType}
Difficulty: ${difficulty}

RULES:
1. Respond ONLY as a production system — CLI output, dashboard readings, log excerpts, metric values.
2. Make outputs realistic: include realistic timestamps, pod names, IPs, error codes.
3. Gradually reveal clues through realistic system behavior. Harder difficulty = more noise, less obvious signals.
4. If the responder runs a command that would expose the root cause, show realistic evidence (but let them connect the dots).
5. If asked something a real system can't answer (e.g. "what's wrong?"), respond as a system would: no direct answer.
6. Keep responses under 25 lines. Use code block formatting for CLI output.
7. If the responder says they've fixed it (kubectl apply, config change, restart, etc.) and the fix is correct, confirm recovery with metrics normalizing. If the fix is wrong, show symptoms persisting.`;

const SCORING_SYSTEM = `You are an expert SRE evaluator scoring an incident response drill.
Analyze the full conversation and return ONLY valid JSON:
{
  "correctDiagnosis": boolean,
  "mitigationQuality": "none" | "partial" | "correct",
  "communicationScore": 0-25,
  "speedScore": 0-25,
  "diagnosisScore": 0-25,
  "mitigationScore": 0-25,
  "feedback": "2-3 sentence overall assessment",
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"]
}
Scoring rubric:
- communicationScore: Did they clearly state what they found and what they did?
- speedScore: Did they act decisively without wasted turns? 25=<5 turns to root cause, 15=6-10 turns, 5=>10 turns
- diagnosisScore: Did they correctly identify the root cause before attempting a fix?
- mitigationScore: Was the final fix correct and complete?`;

export class RehearsalService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }

  async generateScenario(tenantId: string, difficulty: Difficulty): Promise<Scenario> {
    // Pull recent incident titles for context so scenarios feel relevant
    const { rows: recentIncidents } = await db.query(
      `SELECT title, severity, affected_systems, ai_root_cause
       FROM incidents
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 10`,
      [tenantId]
    );

    const contextSummary = recentIncidents.length > 0
      ? `Recent incidents at this org:\n${recentIncidents.map((i: { severity: string; title: string; affected_systems: string[] | null; ai_root_cause: string | null }) =>
          `- [${i.severity}] ${i.title}${i.affected_systems?.length ? ` (${i.affected_systems.join(', ')})` : ''}${i.ai_root_cause ? ` — root cause: ${i.ai_root_cause}` : ''}`
        ).join('\n')}`
      : 'No incident history available — generate a realistic scenario for a typical SaaS product.';

    const difficultyNote = {
      easy: 'Make the root cause findable within 3-4 targeted commands. Use clear signal-to-noise ratio.',
      medium: 'Add some red herrings. Root cause findable within 6-8 commands by a competent SRE.',
      hard: 'High noise, cascading symptoms, misleading initial signals. Expert-level investigation required.',
    }[difficulty];

    const response = await this.client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 800,
      system: SCENARIO_SYSTEM,
      messages: [{
        role: 'user',
        content: `Generate a ${difficulty} difficulty incident drill scenario.
${difficultyNote}

${contextSummary}

Make it different from recent incidents if possible. Be creative but realistic.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    return JSON.parse(text) as Scenario;
  }

  async startSession(
    tenantId: string,
    createdBy: string,
    difficulty: Difficulty,
  ): Promise<{ session: Record<string, unknown>; openingMessage: string }> {
    const scenario = await this.generateScenario(tenantId, difficulty);

    const { rows } = await db.query(
      `INSERT INTO rehearsal_sessions
         (tenant_id, created_by, title, difficulty, scenario)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, createdBy, scenario.title, difficulty, JSON.stringify(scenario)]
    );
    const session = rows[0];

    const openingMessage = `🚨 **INCIDENT DRILL STARTED** — Difficulty: ${difficulty.toUpperCase()}\n\n${scenario.initialAlert}\n\n_Investigate, diagnose, and resolve. When you believe you've fixed the issue, type_ \`RESOLVED: <explanation of what you did and why>\`.`;

    await db.query(
      `INSERT INTO rehearsal_messages (session_id, role, content) VALUES ($1, 'system', $2)`,
      [session.id, openingMessage]
    );

    logger.info('Rehearsal session started', { sessionId: session.id, difficulty, tenantId });
    return { session, openingMessage };
  }

  async respond(
    sessionId: string,
    tenantId: string,
    userMessage: string,
  ): Promise<string> {
    const { rows: sessionRows } = await db.query(
      `SELECT * FROM rehearsal_sessions WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [sessionId, tenantId]
    );
    const session = sessionRows[0];
    if (!session) throw new Error('Session not found');
    if (session.status !== 'active') throw new Error('Session is no longer active');

    const { rows: messages } = await db.query(
      `SELECT role, content FROM rehearsal_messages WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionId]
    );

    // Save the responder's message
    await db.query(
      `INSERT INTO rehearsal_messages (session_id, role, content) VALUES ($1, 'responder', $2)`,
      [sessionId, userMessage]
    );

    const scenario: Scenario = session.scenario;
    const difficulty: Difficulty = session.difficulty;

    // Check for hint request
    const turnCount = messages.filter((m: { role: string }) => m.role === 'responder').length;
    const hintIndex = Math.min(Math.floor(turnCount / 5), scenario.hints.length - 1);
    const hintEligible = turnCount > 0 && turnCount % 5 === 0 && scenario.hints[hintIndex];

    const history = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'responder' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));

    const response = await this.client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 600,
      system: SIMULATION_SYSTEM(scenario, difficulty),
      messages: [
        ...history,
        { role: 'user' as const, content: userMessage },
      ],
    });

    let reply = response.content[0].type === 'text' ? response.content[0].text : '';

    if (hintEligible) {
      reply += `\n\n> 💡 **Hint available** — type \`hint\` to reveal it.`;
    }

    if (userMessage.toLowerCase() === 'hint' && scenario.hints[hintIndex]) {
      reply = `> 💡 **Hint ${hintIndex + 1}:** ${scenario.hints[hintIndex]}`;
    }

    await db.query(
      `INSERT INTO rehearsal_messages (session_id, role, content) VALUES ($1, 'system', $2)`,
      [sessionId, reply]
    );

    return reply;
  }

  async concludeSession(
    sessionId: string,
    tenantId: string,
    resolution: string,
  ): Promise<{ score: number; details: ScoringDetails }> {
    const { rows: sessionRows } = await db.query(
      `SELECT * FROM rehearsal_sessions WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [sessionId, tenantId]
    );
    const session = sessionRows[0];
    if (!session) throw new Error('Session not found');
    if (session.status !== 'active') throw new Error('Session already concluded');

    const { rows: messages } = await db.query(
      `SELECT role, content, created_at FROM rehearsal_messages WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionId]
    );

    const scenario: Scenario = session.scenario;
    const startedAt = new Date(session.started_at).getTime();
    const now = Date.now();
    const elapsedMinutes = Math.round((now - startedAt) / 60000);

    const transcript = messages
      .map((m: { role: string; content: string }) => `[${m.role.toUpperCase()}]: ${m.content}`)
      .join('\n\n');

    const scoringResponse = await this.client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 700,
      system: SCORING_SYSTEM,
      messages: [{
        role: 'user',
        content: `Score this incident drill session.

Scenario: ${scenario.title}
True root cause: ${scenario.hiddenRootCause}
Difficulty: ${session.difficulty}
Elapsed time: ${elapsedMinutes} minutes
Responder's stated resolution: "${resolution}"

Full transcript:
${transcript}`,
      }],
    });

    const scoreText = scoringResponse.content[0].type === 'text' ? scoringResponse.content[0].text : '{}';
    const details: ScoringDetails = {
      timeToFirstAction: Math.round((now - startedAt) / 1000),
      correctDiagnosis: false,
      mitigationQuality: 'none',
      communicationScore: 0,
      speedScore: 0,
      diagnosisScore: 0,
      mitigationScore: 0,
      feedback: '',
      strengths: [],
      improvements: [],
      ...JSON.parse(scoreText),
    };

    const score = details.communicationScore + details.speedScore + details.diagnosisScore + details.mitigationScore;

    await db.query(
      `UPDATE rehearsal_sessions
       SET status = 'completed', score = $1, scoring_details = $2, completed_at = NOW()
       WHERE id = $3`,
      [score, JSON.stringify(details), sessionId]
    );

    logger.info('Rehearsal session completed', { sessionId, score });
    return { score, details };
  }

  async getResilienceScore(tenantId: string): Promise<{
    score: number | null;
    trend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
    completedSessions: number;
    avgScore: number | null;
    recentSessions: Record<string, unknown>[];
  }> {
    const { rows } = await db.query(
      `SELECT id, title, difficulty, score, completed_at
       FROM rehearsal_sessions
       WHERE tenant_id = $1 AND status = 'completed' AND deleted_at IS NULL
       ORDER BY completed_at DESC
       LIMIT 20`,
      [tenantId]
    );

    if (rows.length === 0) {
      return { score: null, trend: 'insufficient_data', completedSessions: 0, avgScore: null, recentSessions: [] };
    }

    const scores = rows.map((r: { score: number }) => r.score).filter(Boolean) as number[];
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    // Rolling score = weighted average: recent sessions count more
    const weighted = scores.slice(0, 5).reduce((acc, s, i) => acc + s * (5 - i), 0);
    const weightSum = scores.slice(0, 5).reduce((acc, _, i) => acc + (5 - i), 0);
    const score = weightSum > 0 ? Math.round(weighted / weightSum) : null;

    // Trend: compare last 3 vs prior 3
    let trend: 'improving' | 'declining' | 'stable' | 'insufficient_data' = 'insufficient_data';
    if (scores.length >= 6) {
      const recent = scores.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      const prior  = scores.slice(3, 6).reduce((a, b) => a + b, 0) / 3;
      trend = recent > prior + 3 ? 'improving' : recent < prior - 3 ? 'declining' : 'stable';
    } else if (scores.length >= 3) {
      trend = 'stable';
    }

    return {
      score,
      trend,
      completedSessions: rows.length,
      avgScore,
      recentSessions: rows.slice(0, 5),
    };
  }
}
