import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const token = useAuthStore((s) => s.token);
  const navigate = useNavigate();

  useEffect(() => {
    if (token) navigate('/', { replace: true });
  }, [token, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const resp = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setError(data?.error || '注册失败');
        return;
      }
      const payload = data?.data;
      if (!payload?.token || !payload?.user) {
        setError('注册响应异常');
        return;
      }
      setAuth({ token: payload.token, user: payload.user });
      navigate('/', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white px-4">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-lg p-6">
        <h1 className="text-xl font-semibold mb-4">注册</h1>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="block text-sm text-gray-300 mb-1">邮箱</label>
            <input
              className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">密码（至少 6 位）</label>
            <input
              className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 outline-none"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {error ? <div className="text-sm text-red-400">{error}</div> : null}

          <button
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded py-2"
            type="submit"
            disabled={loading}
          >
            {loading ? '注册中...' : '注册'}
          </button>
        </form>

        <div className="text-sm text-gray-400 mt-4">
          已有账号？<Link className="text-blue-400 hover:underline" to="/login">去登录</Link>
        </div>
      </div>
    </div>
  );
}

