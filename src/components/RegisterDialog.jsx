import { forwardRef, useEffect, useState, useRef } from "react";
import { API_BASE } from "../config";

const AuthDialog = forwardRef(
  ({ onLogin, onRegister, onGoogleLogin, error }, ref) => {
    const [mode, setMode] = useState("login");
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [localError, setLocalError] = useState("");
    const googleBtnRef = useRef(null);

useEffect(() => {

    const clientID = window.GOOGLE_CLIENT_ID;

    if (window.google && googleBtnRef.current && clientID) {
        window.google.accounts.id.initialize({
            client_id: clientID, 
            callback: onGoogleLogin,
        });
        window.google.accounts.id.renderButton(googleBtnRef.current, { theme: "outline", size: "large", width: "300" });
    }
}, [onGoogleLogin]);

    const handleSubmit = async (e) => {
      e.preventDefault();
      setLocalError("");
      

      const url = mode === "login" 
        ? API_BASE + '/login' 
        : API_BASE + '/register';
      
      const body = mode === "login" 
        ? { email, password }
        : { username, email, password };

      try {
          const response = await fetch(url, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(body)
          });
          
          const data = await response.json();
          
          if (response.ok) {
            localStorage.setItem('userId', data.userId);
            localStorage.setItem('username', data.username);
            ref.current?.close(); resetForm(); window.location.reload(); 
          } else { 
            setLocalError(data.message || "Помилка"); 
          }
      } catch (err) { setLocalError("Не вдалося з'єднатися з сервером"); }
    };

    const resetForm = () => { setUsername(""); setEmail(""); setPassword(""); setLocalError(""); };
    const switchMode = (newMode) => { setMode(newMode); resetForm(); };
    const displayError = localError || error;

    const inputStyle = {
        backgroundColor: '#2b2b2b', color: '#ffffff', border: '1px solid #555',
        borderRadius: '6px', padding: '10px', width: '100%', fontSize: '14px',
        outline: 'none', display: 'block', marginBottom: '10px'
    };

    return (
      <dialog ref={ref} onClose={resetForm}>
        <div className="modal__head">
          <strong>{mode === "login" ? "Вхід" : "Реєстрація"}</strong>
          <button className="btn btn-icon" onClick={() => ref.current?.close()}>✕</button>
        </div>
        <div className="modal__body" style={{ minWidth: 320, padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 20 }}>
            <button className={`btn ${mode === "login" ? "btn--primary" : ""}`} onClick={() => switchMode("login")}>Вхід</button>
            <button className={`btn ${mode === "register" ? "btn--primary" : ""}`} onClick={() => switchMode("register")}>Реєстрація</button>
          </div>
          <form onSubmit={handleSubmit}>
            {mode === "register" && (
              <div>
                <label>Нікнейм</label>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required style={inputStyle} />
              </div>
            )}
            <div>
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label>Пароль</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} />
            </div>
            {displayError && <p style={{ color: "#ef4444", textAlign: "center", margin: "10px 0" }}>{displayError}</p>}
            <div className="modal__foot" style={{paddingTop: 20}}>
              <button className="btn" type="button" onClick={() => ref.current?.close()}>Скасувати</button>
              <button className="btn btn--primary" type="submit">{mode === "login" ? "Увійти" : "Створити акаунт"}</button>
            </div>
          </form>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0" }}>
            <hr style={{ flex: 1, borderTop: "1px solid var(--border)" }} /><span>АБО</span><hr style={{ flex: 1, borderTop: "1px solid var(--border)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "center" }} ref={googleBtnRef} />
        </div>
      </dialog>
    );
  }
);

export default AuthDialog;