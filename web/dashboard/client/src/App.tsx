import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SupabaseAuthProvider } from "./contexts/SupabaseAuthContext";
import Home from "./pages/UnifiedHome";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/overview" component={Home} />
      <Route path="/issues" component={Home} />
      <Route path="/headings" component={Home} />
      <Route path="/links" component={Home} />
      <Route path="/images" component={Home} />
      <Route path="/schema" component={Home} />
      <Route path="/geo" component={Home} />
      <Route path="/accessibility" component={Home} />
      <Route path="/technical" component={Home} />
      <Route path="/resources" component={Home} />
      <Route path="/security" component={Home} />
      <Route path="/source" component={Home} />
      <Route path="/projects" component={Home} />
      <Route path="/reports" component={Home} />
      <Route path="/audit/:id/:section" component={Home} />
      <Route path="/audit/:id" component={Home} />
      <Route path="/history" component={Home} />
      <Route path="/performance" component={Home} />
      <Route path="/settings" component={Home} />
      <Route path="/docs" component={Home} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark"><SupabaseAuthProvider><TooltipProvider><Toaster /><Router /></TooltipProvider></SupabaseAuthProvider></ThemeProvider>
    </ErrorBoundary>
  );
}
