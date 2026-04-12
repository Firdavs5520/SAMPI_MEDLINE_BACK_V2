function Modal({
  open,
  title,
  children,
  footer,
  onClose,
  panelClassName = "",
  bodyClassName = ""
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-4 backdrop-blur-[1px]">
      <div className={`w-full max-w-2xl rounded-2xl bg-white shadow-xl ${panelClassName}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            &times;
          </button>
        </div>

        <div className={`max-h-[78vh] overflow-y-auto px-4 py-3 sm:max-h-[70vh] sm:px-5 sm:py-4 ${bodyClassName}`}>
          {children}
        </div>

        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-5 sm:py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default Modal;
