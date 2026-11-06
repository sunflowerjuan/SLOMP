import { AppRoutes } from "./AppRoutes";
import { AuthProvider } from "./auth/AuthProvider";
import { PublicConsultationRoute } from "./pages/PublicConsultation/PublicConsultationRoute";
import { usePublicConsultationRoute } from "./routes";

function App() {
  const publicConsultation = usePublicConsultationRoute();

  // The public consultation lives OUTSIDE AuthProvider and the login flow:
  // it neither depends on nor touches the Administrator's session.
  if (publicConsultation) {
    return <PublicConsultationRoute slug={publicConsultation.slug} />;
  }

  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
