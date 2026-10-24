import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import { AuthProvider, AppErrorBoundary, Protected } from './common';
import { Login, Registro } from './auth';
import { Home } from './home';
import { ElectionList, ManageElection, NewElection, Vote } from './elections';
import { ResultDetail, ResultsList } from './results';
import { Profile } from './profile';
import { Users } from './users';
import { RequestPasswordReset, ResetPassword } from './password-reset';
import { Toaster } from 'sonner';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppErrorBoundary>
          <Toaster position="top-right" richColors closeButton />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/registro" element={<Registro />} />
            <Route path="/recuperar-contrasena" element={<RequestPasswordReset />} />
            <Route path="/restablecer-contrasena" element={<ResetPassword />} />
            <Route path="/" element={<Home />} />
            <Route path="/elecciones" element={<Protected role="ESTUDIANTE"><ElectionList /></Protected>} />
            <Route path="/elecciones/:id/votar" element={<Protected role="ESTUDIANTE"><Vote /></Protected>} />
            <Route path="/admin/elecciones" element={<Protected role="ADMINISTRADOR"><ElectionList /></Protected>} />
            <Route path="/admin/elecciones/nueva" element={<Protected role="ADMINISTRADOR"><NewElection /></Protected>} />
            <Route path="/admin/elecciones/:id" element={<Protected role="ADMINISTRADOR"><ManageElection /></Protected>} />
            <Route path="/admin/usuarios" element={<Protected role="ADMINISTRADOR"><Users /></Protected>} />
            <Route path="/resultados" element={<Protected><ResultsList /></Protected>} />
            <Route path="/resultados/:id" element={<Protected role="ESTUDIANTE"><ResultDetail /></Protected>} />
            <Route path="/admin/resultados/:id" element={<Protected role="ADMINISTRADOR"><ResultDetail admin /></Protected>} />
            <Route path="/perfil" element={<Protected role="ESTUDIANTE"><Profile /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(<App />);
