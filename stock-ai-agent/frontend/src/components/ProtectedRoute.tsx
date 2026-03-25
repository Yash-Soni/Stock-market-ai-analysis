import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import Login from "../pages/Login";

type Props = {
  children: React.ReactNode;
};

export default function ProtectedRoute({ children }: Props) {
  const { user, loading } = useContext(AuthContext);

  if (loading) return <p>Loading...</p>;
  if (!user) return <Login />;

  return <>{children}</>;
}