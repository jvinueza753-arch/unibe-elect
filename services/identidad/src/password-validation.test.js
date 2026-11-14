const {
  contrasenaSchema,
  validarPoliticaContrasena,
} = require('./password-validation');

describe('política de contraseñas', () => {
  test.each([
    ['LONGITUD_MINIMA', 'Abc123'],
    ['SIN_LETRA', '1234567890'],
    ['SIN_NUMERO', 'SoloLetrasSuficientes'],
    ['CONTIENE_CODIGO', 'MatriculaE2026segura'],
    ['CONTIENE_CORREO', 'UsuarioCorreoSeguro2026'],
    ['CONTRASENA_COMUN', 'Un1be2026'],
  ])('rechaza la regla %s', (codigo, contrasena) => {
    const errores = validarPoliticaContrasena(contrasena, {
      correo: 'usuario@unibe.edu.ec',
      codigoEstudiantil: 'E2026',
    });

    expect(errores).toContain(codigo);
  });

  test('compara código y correo sin distinguir mayúsculas ni tildes', () => {
    expect(validarPoliticaContrasena('CÓDIGOseguro2026', {
      codigoEstudiantil: 'codigo',
    })).toContain('CONTIENE_CODIGO');
    expect(validarPoliticaContrasena('JoseCorreoSeguro2026', {
      correo: 'josé@unibe.edu.ec',
    })).toContain('CONTIENE_CORREO');
  });

  test('normaliza variantes leet al detectar contraseñas comunes', () => {
    expect(validarPoliticaContrasena('P@ssw0rd123')).toContain('CONTRASENA_COMUN');
  });

  test('mantiene el máximo de bcrypt en bytes UTF-8', () => {
    expect(contrasenaSchema.safeParse(`A1${'é'.repeat(35)}`).success).toBe(true);
    expect(validarPoliticaContrasena(`A1${'é'.repeat(36)}`)).toContain('LIMITE_BYTES');
    expect(contrasenaSchema.safeParse(`A1${'é'.repeat(36)}`).success).toBe(false);
  });

  test('rechaza más de 128 caracteres aunque los bytes no superen el límite por otra causa', () => {
    expect(validarPoliticaContrasena(`A1${'x'.repeat(127)}`)).toContain('LONGITUD_MAXIMA');
  });
});
