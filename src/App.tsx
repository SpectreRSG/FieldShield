import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { StoreProvider, useStore } from './state/store';
import { ConfirmProvider, Notice, ToastProvider } from './components/ui';
import { AppShell } from './components/AppShell';
import { TutorialProvider } from './tutorial/Tutorial';
import { Dashboard } from './modules/Dashboard';
import { NewInspection } from './modules/NewInspection';
import { MissionControl } from './modules/MissionControl';
import { Measurements } from './modules/Measurements';
import { Photos } from './modules/Photos';
import { NotesReport } from './modules/NotesReport';
import { EstimateQC } from './modules/EstimateQC';
import { ExportReview } from './modules/ExportReview';
import { Settings } from './modules/Settings';
import { Help } from './modules/Help';
import { Pick } from './modules/Pick';
import { UpdatePrompt } from './components/UpdatePrompt';

function RedirectToMission() {
  const { id } = useParams();
  return <Navigate to={`/i/${id}/mission`} replace />;
}

function Routed() {
  const { loadError } = useStore();
  return (
    <AppShell>
      {loadError && (
        <Notice kind="error">
          FieldShield could not open its on-device database: {loadError}. Private browsing modes or blocked site storage can cause this; work cannot be
          saved until it is resolved.
        </Notice>
      )}
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/new" element={<NewInspection />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/help" element={<Help />} />
        <Route path="/pick/:module" element={<Pick />} />
        <Route path="/i/:id" element={<RedirectToMission />} />
        <Route path="/i/:id/mission" element={<MissionControl />} />
        <Route path="/i/:id/measure" element={<Measurements />} />
        <Route path="/i/:id/photos" element={<Photos />} />
        <Route path="/i/:id/notes" element={<NotesReport />} />
        <Route path="/i/:id/qc" element={<EstimateQC />} />
        <Route path="/i/:id/export" element={<ExportReview />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <UpdatePrompt />
    </AppShell>
  );
}

export function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <ConfirmProvider>
          <HashRouter>
            <TutorialProvider>
              <Routed />
            </TutorialProvider>
          </HashRouter>
        </ConfirmProvider>
      </ToastProvider>
    </StoreProvider>
  );
}
