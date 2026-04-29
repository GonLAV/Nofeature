import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/auth.store';
import { Zap } from 'lucide-react';
import api from '../../lib/api';

export default function Register() {
  const navigate = useNavigate();
  const login = useAuthStore(s => s.login);
  const [form, setForm] = useState({ name: '', email: '', password: '', tenantName: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 1. Create tenant first
      const slug = form.tenantName.toLowerCase().replace(/\s+/g, '-');
      const { data: tenantData } = await api.post('/tenants', { name: form.tenantName, slug });
      // 2. Register user
      await api.post('/auth/register', {
        name: form.name, email: form.email,
        password: form.password, tenantId: tenantData.data.id,
      });
      // 3. Login
      await login(form.email, form.password);
      navigate('/');
      toast.success('Welcome to War Room AI!');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border shadow-sm p-8 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <div className="p-2 bg-red-600 rounded-lg"><Zap size={18} className="text-white" /></div>
          <span className="text-lg font-semibold">War Room AI</span>
        </div>
        <h1 className="text-xl font-semibold mb-1">Create account</h1>
        <p className="text-sm text-gray-500 mb-6">Set up your team's incident hub</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Company name</label>
            <input value={form.tenantName} onChange={e => setForm({...form, tenantName: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              required placeholder="Acme Inc." />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Your name</label>
            <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              required placeholder="Jane Smith" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              required placeholder="you@company.com" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              required placeholder="Min 8 chars, 1 uppercase, 1 number" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50 mt-2">
            {loading ? 'Creating...' : 'Create account'}
          </button>
        </form>
        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account? <a href="/login" className="text-red-600 hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  );
}
