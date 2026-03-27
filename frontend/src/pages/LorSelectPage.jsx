import { useNavigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function LorSelectPage() {
  const navigate = useNavigate();
  const { setLorIdentity } = useAuth();

  const chooseLor = (value) => {
    setLorIdentity(value);
    navigate("/lor/checks", { replace: true });
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="card w-full max-w-lg p-6">
        <h1 className="text-2xl font-bold text-slate-800">LOR tanlash</h1>
        <p className="mt-2 text-sm text-slate-500">
          Tizimga kirgandan keyin qaysi LOR ekaningizni tanlang.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button className="w-full py-3" onClick={() => chooseLor("lor1")}>
            LOR 1
          </Button>
          <Button
            variant="secondary"
            className="w-full py-3"
            onClick={() => chooseLor("lor2")}
          >
            LOR 2
          </Button>
        </div>
      </div>
    </div>
  );
}

export default LorSelectPage;
