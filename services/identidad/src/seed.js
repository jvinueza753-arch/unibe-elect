const db = require('./db');
const bcrypt = require('bcryptjs');

async function seedDemoData() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Las semillas de demostración están deshabilitadas en producción');
  }
  if (process.env.ALLOW_DEMO_SEED !== 'true') {
    console.log('Semilla de demostración omitida; requiere ALLOW_DEMO_SEED=true');
    return;
  }

  const adminPassword = process.env.DEMO_ADMIN_PASSWORD;
  const studentPassword = process.env.DEMO_STUDENT_PASSWORD;
  if (!adminPassword || !studentPassword || adminPassword.length < 16 || studentPassword.length < 16) {
    throw new Error('Configure DEMO_ADMIN_PASSWORD y DEMO_STUDENT_PASSWORD (mínimo 16 caracteres)');
  }

  const users = [
    {
      nombres: 'Administrador',
      apellidos: 'UNIBE',
      correo: 'admin@unibe.edu.ec',
      contrasena: adminPassword,
      codigoEstudiantil: 'ADMIN000',
      facultad: 'Administración',
      carrera: 'Administración',
      rol: 'ADMINISTRADOR',
    },
    ...Array.from({ length: 12 }, (_, index) => ({
      nombres: 'Estudiante',
      apellidos: String(index + 1).padStart(2, '0'),
      correo: `estudiante${String(index + 1).padStart(2, '0')}@unibe.edu.ec`,
      contrasena: studentPassword,
      codigoEstudiantil: `E${String(index + 1).padStart(4, '0')}`,
      facultad: index < 6 ? 'Ingeniería' : index < 9 ? 'Ciencias Empresariales' : 'Derecho',
      carrera: index < 4 ? 'Software' : index < 6 ? 'Sistemas' : index < 9 ? 'Administración' : 'Derecho',
      rol: 'ESTUDIANTE',
    })),
  ];

  for (const user of users) {
    const { contrasena, ...data } = user;
    await db.usuario.upsert({
      where: { correo: user.correo },
      update: {},
      create: { ...data, contrasenaHash: await bcrypt.hash(contrasena, 12) },
    });
  }
  console.log('Semilla de demostración completada');
}

seedDemoData()
  .catch((error) => {
    console.error('No se pudo ejecutar la semilla de demostración:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
