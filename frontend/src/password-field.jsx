import React, { useEffect, useMemo, useState } from 'react';

const commonPasswords = new Set([
  '123456789', 'contrasena123', 'qwerty123', 'password1', 'unibe2025',
  'unibe2026', 'ecuador123', 'quito2026', 'admin123', 'bienvenido123',
  'estudiante123', 'universidad123', 'p@ssword123', 'passw0rd',
]);

const ruleLabels = {
  LONGITUD_MINIMA: 'Usa al menos 10 caracteres.',
  LONGITUD_MAXIMA: 'Usa como máximo 128 caracteres.',
  LIMITE_BYTES: 'La contraseña no puede superar 72 bytes UTF-8.',
  SIN_LETRA: 'Incluye al menos una letra.',
  SIN_NUMERO: 'Incluye al menos un número.',
  CONTIENE_CODIGO: 'No incluyas tu código estudiantil.',
  CONTIENE_CORREO: 'No incluyas la parte local de tu correo.',
  CONTRASENA_COMUN: 'Elige una contraseña menos común.',
  CONTRASENA_REUTILIZADA: 'Elige una contraseña distinta de la actual.',
};

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function normalizeCommon(value) {
  return normalize(value).replace(/[@013457$]/g, (char) => ({
    '@': 'a', 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '$': 's',
  })[char]);
}

function localRules(value, { correo = '', codigoEstudiantil = '', currentPassword = '' } = {}) {
  const failures = new Set();
  const normalized = normalize(value);
  if ([...value].length < 10) failures.add('LONGITUD_MINIMA');
  if ([...value].length > 128) failures.add('LONGITUD_MAXIMA');
  if (new Blob([value]).size > 72) failures.add('LIMITE_BYTES');
  if (!/\p{L}/u.test(value)) failures.add('SIN_LETRA');
  if (!/\d/.test(value)) failures.add('SIN_NUMERO');
  const code = normalize(codigoEstudiantil);
  if (code && normalized.includes(code)) failures.add('CONTIENE_CODIGO');
  const localPart = normalize(String(correo).split('@')[0] || '');
  if (localPart.length >= 4 && normalized.includes(localPart)) failures.add('CONTIENE_CORREO');
  if (commonPasswords.has(normalizeCommon(value))) failures.add('CONTRASENA_COMUN');
  if (currentPassword && value === currentPassword) failures.add('CONTRASENA_REUTILIZADA');
  return failures;
}

function strength(value, failures) {
  if (!value) return 0;
  let score = 0;
  if ([...value].length >= 10) score += 1;
  if ([...value].length >= 14) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^\p{L}\d]/u.test(value)) score += 1;
  if (/(.)\1{2,}/u.test(value) || /(?:012|123|234|345|456|567|678|789|abc|bcd|cde|qwe|asd)/i.test(value)) score -= 2;
  if (failures.has('CONTRASENA_COMUN') || failures.has('CONTIENE_CORREO') || failures.has('CONTIENE_CODIGO')) score -= 2;
  return Math.max(0, Math.min(5, score));
}

export function PasswordField({
  name = 'contrasena',
  label = 'Contraseña',
  value,
  onChange,
  correo,
  codigoEstudiantil,
  currentPassword,
  errorCodes = [],
  onValidityChange,
  autoComplete = 'new-password',
}) {
  const [visible, setVisible] = useState(false);
  const id = `password-${name}`;
  const rules = useMemo(
    () => localRules(value || '', { correo, codigoEstudiantil, currentPassword }),
    [value, correo, codigoEstudiantil, currentPassword],
  );
  const level = strength(value || '', rules);
  const levels = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Excelente'];
  const isValid = Boolean(value) && rules.size === 0;

  useEffect(() => {
    onValidityChange?.(isValid);
  }, [isValid, onValidityChange]);

  const requirements = [
    ['LONGITUD_MINIMA', 'Al menos 10 caracteres'],
    ['LIMITE_BYTES', 'Máximo 72 bytes UTF-8'],
    ['LONGITUD_MAXIMA', 'Máximo 128 caracteres'],
    ['SIN_LETRA', 'Al menos una letra'],
    ['SIN_NUMERO', 'Al menos un número'],
    ['CONTIENE_CODIGO', 'No contiene tu código estudiantil'],
    ['CONTIENE_CORREO', 'No contiene tu correo'],
    ['CONTRASENA_COMUN', 'No es una contraseña común'],
    ['CONTRASENA_REUTILIZADA', 'Es distinta de la contraseña actual'],
  ];

  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <div className="pw-input">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          maxLength={128}
          required
          aria-describedby={`${id}-meter ${id}-rules ${id}-errors`}
        />
        <button
          className="secondary"
          type="button"
          aria-pressed={visible}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          onClick={() => setVisible((shown) => !shown)}
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      <div id={`${id}-meter`} className="pw-meter">
        <div
          className="pw-meter-track"
          role="meter"
          aria-label="Fortaleza de la contraseña"
          aria-valuemin={0}
          aria-valuemax={5}
          aria-valuenow={level}
        >
          <span className={`pw-meter-fill level-${level}`} />
        </div>
        <span aria-live="polite">{value ? levels[Math.max(0, level - 1)] : 'Escribe una contraseña'}</span>
      </div>
      <ul id={`${id}-rules`} className="pw-rules">
        {requirements.map(([code, text]) => {
          const satisfied = !rules.has(code);
          return (
            <li key={code} className={satisfied ? 'pw-rule-valid' : 'pw-rule-pending'}>
              <span aria-hidden="true">{satisfied ? '✓' : '○'}</span> {text}
            </li>
          );
        })}
      </ul>
      {errorCodes.length > 0 && (
        <ul id={`${id}-errors`} className="error pw-errors" role="alert">
          {[...new Set(errorCodes)].map((code) => (
            <li key={code}>{ruleLabels[code] || 'La contraseña no cumple un requisito.'}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export { localRules as validarContrasenaLocal };
