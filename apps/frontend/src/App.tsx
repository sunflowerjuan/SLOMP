import { AppRoutes } from "./AppRoutes";
import { AuthProvider } from "./auth/AuthProvider";
import { PublicConsultationPage } from "./pages/PublicConsultation/PublicConsultationPage";
import { useIsPublicConsultationRoute } from "./routes";

function App() {
  const isPublicConsultation = useIsPublicConsultationRoute();

  // The public consultation lives OUTSIDE AuthProvider and the login flow:
  // it neither depends on nor touches the Administrator's session.
  if (isPublicConsultation) {
    return <PublicConsultationPage />;
  }

  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
