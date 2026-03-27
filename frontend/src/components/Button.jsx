function Button({
  children,
  type = "button",
  loading = false,
  disabled = false,
  variant = "primary",
  className = "",
  ...props
}) {
  const variants = {
    primary:
      "bg-primary text-white hover:bg-primary-dark focus:ring-primary/40 disabled:bg-slate-300",
    secondary:
      "bg-slate-200 text-slate-700 hover:bg-slate-300 focus:ring-slate-300 disabled:bg-slate-100",
    danger:
      "bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-300 disabled:bg-rose-300",
    accent:
      "bg-accent text-white hover:bg-orange-600 focus:ring-orange-300 disabled:bg-orange-300"
  };

  return (
    <button
      type={type}
      disabled={loading || disabled}
      className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-4 ${variants[variant]} ${className}`}
      {...props}
    >
      {loading ? "Yuklanmoqda..." : children}
    </button>
  );
}

export default Button;
