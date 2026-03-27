import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { extractErrorMessage } from "../utils/format.js";
import { roleHomePath } from "../utils/constants.js";
import Input from "../components/Input.jsx";
import Button from "../components/Button.jsx";
import Alert from "../components/Alert.jsx";

function LoginPage() {
  const navigate = useNavigate();
  const { login, token, role, lorIdentity, loading } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const homePath =
    role === "lor" ? (lorIdentity ? "/lor/checks" : "/lor/select") : roleHomePath[role];

  if (token && role) {
    return <Navigate to={homePath} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.email || !form.password) {
      setError("Email va password kiritilishi shart.");
      return;
    }

    try {
      const user = await login(form.email, form.password);
      navigate(user.role === "lor" ? "/lor/select" : roleHomePath[user.role], { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-cyan-50 to-orange-50 p-4">
      <div className="w-full max-w-md card p-6">
        <h1 className="text-2xl font-bold text-slate-800">Sampi Medline</h1>
        <p className="mt-1 text-sm text-slate-500">Tizimga kirish</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="nurse@mail.com"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={form.password}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, password: e.target.value }))
            }
          />

          <Alert type="error" message={error} />

          <Button type="submit" loading={loading} className="w-full">
            Login
          </Button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
