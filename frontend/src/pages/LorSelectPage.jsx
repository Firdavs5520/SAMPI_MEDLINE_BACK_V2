import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function LorSelectPage() {
  const navigate = useNavigate();
  const { setLorIdentity } = useAuth();

  const chooseLor = (value) => {
    setLorIdentity(value);
    navigate("/lor/checks", { replace: true });
  };

  return (
    <div className="lor-select-shell">
      <div className="lor-select-glow" />
      <div className="lor-select-card route-enter">
        <div className="lor-select-header">
          <span className="lor-select-chip">Mutaxassis tanlash</span>
          <h1 className="text-balance text-3xl font-extrabold text-slate-900 sm:text-[2rem]">
            LOR ish joyini tanlang
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
            Tizim bir xil login bilan ishlaydi. Qaysi postda ishlayotgan bo'lsangiz,
            shu LOR bo'limini tanlang.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            className="lor-choice-card lor-choice-primary"
            onClick={() => chooseLor("lor1")}
          >
            <div className="lor-choice-badge">LOR-1</div>
            <p className="mt-2 text-lg font-bold text-slate-900">Asosiy kabinet</p>
            <p className="mt-1 text-sm text-slate-600">Bemor qabulini LOR-1 nomida yuritish</p>
            <span className="lor-choice-action">Tanlash</span>
          </button>

          <button
            type="button"
            className="lor-choice-card lor-choice-secondary"
            onClick={() => chooseLor("lor2")}
          >
            <div className="lor-choice-badge">LOR-2</div>
            <p className="mt-2 text-lg font-bold text-slate-900">Qo'shimcha kabinet</p>
            <p className="mt-1 text-sm text-slate-600">Bemor qabulini LOR-2 nomida yuritish</p>
            <span className="lor-choice-action">Tanlash</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default LorSelectPage;
