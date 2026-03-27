import Modal from "./Modal.jsx";
import Button from "./Button.jsx";

function ConfirmActionModal({
  open,
  title = "Tasdiqlash",
  description = "",
  confirmText = "Tasdiqlash",
  cancelText = "Bekor qilish",
  loading = false,
  onConfirm,
  onClose
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
        <p className="text-sm font-medium text-rose-700">{description}</p>
        <p className="mt-2 text-xs text-rose-600">
          Bu amal qaytarilmaydi.
        </p>
      </div>
    </Modal>
  );
}

export default ConfirmActionModal;
