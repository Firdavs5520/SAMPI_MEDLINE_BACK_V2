import { Link } from "react-router-dom";

function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="card w-full max-w-md p-6 text-center">
        <h1 className="text-3xl font-bold text-slate-800">404</h1>
        <p className="mt-2 text-sm text-slate-600">Sahifa topilmadi.</p>
        <Link
          to="/"
          className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Bosh sahifa
        </Link>
      </div>
    </div>
  );
}

export default NotFoundPage;
