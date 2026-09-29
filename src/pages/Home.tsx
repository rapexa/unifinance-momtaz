import Landing from "./Landing";
import Login from "./Login";
import { useSiteInfo } from "@/hooks/useSiteInfo";

/** "/": the sales page on the vendor site for visitors, otherwise the login page. */
const Home = () => {
  const { data: site, isLoading } = useSiteInfo();
  let signedIn = false;
  try {
    signedIn = !!localStorage.getItem("accessToken");
  } catch {
    signedIn = false;
  }
  if (isLoading) return <div className="min-h-screen bg-background" />;
  if (site?.vendor && !signedIn) return <Landing />;
  return <Login />;
};

export default Home;
