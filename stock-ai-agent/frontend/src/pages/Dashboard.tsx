import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export default function Dashboard() {
  const { user } = useContext(AuthContext);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div>
      <h1>Welcome {user?.email}</h1>

      <button onClick={handleLogout}>Logout</button>
    </div>
  );
}