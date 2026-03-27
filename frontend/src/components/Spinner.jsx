function Spinner({ text = "Yuklanmoqda..." }) {
  return (
    <div className="flex items-center gap-3 text-slate-600">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
}

export default Spinner;
