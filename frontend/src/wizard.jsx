import React, { useEffect, useRef, useState } from 'react';

export function Stepper({ steps, currentIndex }) {
  const progress = ((currentIndex + 1) / steps.length) * 100;
  return (
    <div className="wz-stepper" aria-label="Progreso del asistente">
      <div className="wz-progress-track" role="progressbar"
        aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={currentIndex + 1}
        aria-label={`Paso ${currentIndex + 1} de ${steps.length}`}>
        <span className="wz-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <ol style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, index) => (
          <li key={step.id} aria-current={index === currentIndex ? 'step' : undefined}
            className={index <= currentIndex ? 'wz-step-active' : ''}>
            <span>{index + 1}</span><small>{step.titulo}</small>
          </li>
        ))}
      </ol>
      <p className="visually-hidden" aria-live="polite">
        Paso {currentIndex + 1} de {steps.length}
      </p>
    </div>
  );
}

export function StepPanel({ step, index, total }) {
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step.id]);

  return (
    <section className="wz-panel" aria-labelledby={`wz-heading-${step.id}`}>
      <p className="wz-count">Paso {index + 1} de {total}</p>
      <h2 id={`wz-heading-${step.id}`} ref={headingRef} tabIndex={-1}>{step.titulo}</h2>
      {step.descripcion && <p className="muted">{step.descripcion}</p>}
      <div className="wz-content">
        {typeof step.contenido === 'function'
          ? step.contenido({ index, total })
          : step.contenido}
      </div>
    </section>
  );
}

export function Wizard({
  steps,
  onFinish,
  busy = false,
  finishLabel = 'Finalizar',
  error = '',
  onStepChange,
  stepIndex,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [validationError, setValidationError] = useState('');
  const [finishing, setFinishing] = useState(false);
  const current = steps[currentIndex];
  const isBusy = busy || finishing;

  useEffect(() => {
    if (Number.isInteger(stepIndex) && stepIndex >= 0 && stepIndex < steps.length) {
      setCurrentIndex(stepIndex);
      setValidationError('');
    }
  }, [stepIndex, steps.length]);

  function changeStep(nextIndex) {
    setCurrentIndex(nextIndex);
    setValidationError('');
    onStepChange?.(nextIndex);
  }

  function validateCurrent() {
    const result = current.validar?.();
    if (result === false || typeof result === 'string') {
      setValidationError(typeof result === 'string' ? result : 'Completa los campos obligatorios para continuar.');
      return false;
    }
    setValidationError('');
    return true;
  }

  async function finish(event) {
    event.preventDefault();
    if (isBusy || !validateCurrent()) return;
    setFinishing(true);
    try {
      await onFinish?.();
    } finally {
      setFinishing(false);
    }
  }

  if (!current) return null;

  return (
    <form className="panel wz-form" onSubmit={finish}>
      <Stepper steps={steps} currentIndex={currentIndex} />
      <StepPanel step={current} index={currentIndex} total={steps.length} />
      {(validationError || error) && (
        <p className="error wz-error" role="alert">{validationError || error}</p>
      )}
      <div className="wz-actions">
        <button type="button" className="secondary" disabled={currentIndex === 0 || isBusy}
          onClick={() => changeStep(currentIndex - 1)}>
          Atrás
        </button>
        {currentIndex < steps.length - 1 ? (
          <button type="button" className="primary" disabled={isBusy}
            onClick={() => { if (validateCurrent()) changeStep(currentIndex + 1); }}>
            Siguiente
          </button>
        ) : (
          <button type="submit" className="primary" disabled={isBusy}>
            {isBusy ? 'Procesando…' : finishLabel}
          </button>
        )}
      </div>
    </form>
  );
}
