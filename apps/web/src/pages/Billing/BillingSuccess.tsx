import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

export default function BillingSuccess() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const qc = useQueryClient();

  useEffect(() => {
    // Invalidate plan cache so the billing page reflects the new subscription
    qc.invalidateQueries({ queryKey: ['billing-plan'] });

    const t = setTimeout(() => navigate('/billing'), 5000);
    return () => clearTimeout(t);
  }, [navigate, qc]);

  const sessionId = params.get('session_id');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border p-10 max-w-md w-full text-center space-y-5">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle size={32} className="text-green-600" />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscription activated!</h1>
          <p className="text-gray-500 mt-2">
            Welcome to War Room AI. Your team now has access to all features.
          </p>
        </div>

        {sessionId && (
          <p className="text-xs text-gray-400 font-mono truncate">
            Session: {sessionId}
          </p>
        )}

        <div className="space-y-3 text-sm text-left bg-gray-50 rounded-xl p-4">
          <p className="font-medium text-gray-700">What's now unlocked:</p>
          {[
            'Unlimited active incidents',
            'Streaming AI analysis in real-time',
            'Live War Room chat for your team',
            'Automated post-mortem generation',
            'Slack integration & notifications',
          ].map((f) => (
            <div key={f} className="flex items-center gap-2 text-gray-600">
              <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
              {f}
            </div>
          ))}
        </div>

        <button
          onClick={() => navigate('/')}
          className="w-full bg-red-600 text-white py-2.5 rounded-xl font-medium hover:bg-red-700 transition-colors"
        >
          Go to Dashboard
        </button>

        <p className="text-xs text-gray-400">
          Redirecting to billing page in 5 seconds…
        </p>
      </div>
    </div>
  );
}
