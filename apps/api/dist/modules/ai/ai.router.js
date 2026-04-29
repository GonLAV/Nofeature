"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiRouter = void 0;
const express_1 = require("express");
const database_1 = require("../../config/database");
const incidentRepository_1 = require("../../database/repositories/incidentRepository");
const ai_service_1 = require("./ai.service");
const ai_controller_1 = require("./ai.controller");
const auth_1 = require("../../middleware/auth");
const router = (0, express_1.Router)();
exports.aiRouter = router;
const incidentRepo = new incidentRepository_1.IncidentRepository(database_1.pool);
const aiService = new ai_service_1.AiService(incidentRepo);
const aiController = new ai_controller_1.AiController(aiService);
router.use(auth_1.authenticate);
router.post('/incidents/:id/analyze', aiController.analyze);
router.get('/incidents/:id/postmortem', aiController.postmortem);
router.get('/incidents/:id/suggest-responders', aiController.suggestResponders);
//# sourceMappingURL=ai.router.js.map