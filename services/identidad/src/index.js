const { createApp, error } = require('/shared/http');
const { autenticar, requerirRol, emitir, publicKey } = require('/shared/auth');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('./db');
const { limpiarSolicitudesRecuperacion, registerPasswordResetRoutes } = require('./password-reset');
const { crearHandlerLogin } = require('./login');
const {
  contrasenaSchema,
  CONTRASENA_MAXIMO_BYTES,
  CONTRASENA_MINIMO,
  reglasContrasena,
  validarPoliticaContrasena,
} = require('./password-validation');
const app = createApp('identidad'); app.locals.prisma = db;
const registroSchema = z.object({ nombres:z.string().trim().min(1), apellidos:z.string().trim().min(1), correo:z.string().email(), contrasena:z.string(), codigoEstudiantil:z.string().trim().min(1), facultad:z.string().trim().min(1), carrera:z.string().trim().min(1) });
const publico = u => ({ id:u.id,nombres:u.nombres,apellidos:u.apellidos,correo:u.correo,codigoEstudiantil:u.codigoEstudiantil,facultad:u.facultad,carrera:u.carrera,rol:u.rol,estado:u.estado,creadoEn:u.creadoEn });
async function actualizarUsuarioProtegiendoUltimoAdmin(id, data) {
 return db.$transaction(async tx => {
  const actual = await tx.usuario.findUnique({where:{id},select:{id:true,rol:true,estado:true}});
  if (!actual) throw Object.assign(new Error('Usuario no encontrado'),{code:'P2025'});
  const saleDelRolAdminActivo = actual.rol==='ADMINISTRADOR' && actual.estado==='ACTIVO'
   && ((data.rol!==undefined && data.rol!=='ADMINISTRADOR') || (data.estado!==undefined && data.estado!=='ACTIVO'));
  if (saleDelRolAdminActivo) {
   const administradoresActivos = await tx.usuario.count({where:{rol:'ADMINISTRADOR',estado:'ACTIVO'}});
   if (administradoresActivos<=1) throw Object.assign(new Error('No se puede desactivar al último administrador'),{code:'ULTIMO_ADMIN'});
  }
  return tx.usuario.update({where:{id},data});
 },{isolationLevel:'Serializable'});
}
app.post('/api/v1/auth/registro', async (req,res) => {
 const p=registroSchema.safeParse(req.body); if(!p.success)return error(res,400,'DATOS_INVALIDOS','Revisa los campos del registro',p.error.flatten().fieldErrors);
 const {contrasena,...b}=p.data; const correo=b.correo.trim().toLowerCase(); const dominio=(process.env.DOMINIO_CORREO_INSTITUCIONAL||'').trim().toLowerCase();
 const reglasIncumplidas=validarPoliticaContrasena(contrasena,{correo,codigoEstudiantil:b.codigoEstudiantil}); if(reglasIncumplidas.length)return error(res,400,'DATOS_INVALIDOS','La contraseña no cumple los requisitos de seguridad',{contrasena:reglasIncumplidas});
 if(dominio && !correo.endsWith('@'+dominio))return error(res,422,'CORREO_NO_INSTITUCIONAL','Debes usar tu correo institucional');
 try { const u=await db.usuario.create({data:{...b,correo,contrasenaHash:await bcrypt.hash(contrasena,12)}}); return res.status(201).json({data:publico(u)}); }
 catch(e){if(e.code==='P2002')return error(res,409,e.meta?.target?.includes('codigoEstudiantil')?'CODIGO_EXISTENTE':'CORREO_EXISTENTE','El correo o código estudiantil ya está registrado'); throw e; }
});
app.get('/api/v1/auth/politica-contrasena',(_req,res)=>res.json({data:{minimo:CONTRASENA_MINIMO,maximoBytes:CONTRASENA_MAXIMO_BYTES,reglas:reglasContrasena}}));
app.post('/api/v1/auth/login', crearHandlerLogin({ db, error, emitir, publico }));
app.get('/api/v1/auth/me',autenticar,async(req,res)=>{const u=await db.usuario.findUnique({where:{id:req.usuario.sub}});if(!u||u.estado!=='ACTIVO')return error(res,401,'NO_AUTENTICADO','La sesión ya no es válida');res.json({data:publico(u)});});
app.post('/api/v1/auth/cambiar-contrasena',autenticar,async(req,res)=>{const u=await db.usuario.findUnique({where:{id:req.usuario.sub}});if(!u||!await bcrypt.compare(String(req.body?.contrasenaActual||''),u.contrasenaHash))return error(res,401,'CREDENCIALES_INVALIDAS','La contraseña actual es incorrecta');const p=contrasenaSchema.safeParse(req.body?.contrasenaNueva);const reglasIncumplidas=validarPoliticaContrasena(req.body?.contrasenaNueva,{correo:u.correo,codigoEstudiantil:u.codigoEstudiantil});if(!p.success||reglasIncumplidas.length)return error(res,400,'DATOS_INVALIDOS','La contraseña no cumple los requisitos de seguridad',{contrasena:reglasIncumplidas});if(await bcrypt.compare(p.data,u.contrasenaHash))return error(res,400,'CONTRASENA_REUTILIZADA','Elige una contraseña distinta de la actual');await db.usuario.update({where:{id:u.id},data:{contrasenaHash:await bcrypt.hash(p.data,12),sessionVersion:{increment:1}}});res.status(204).end();});
app.get('/api/v1/auth/clave-publica',(_req,res)=>res.json({data:{clavePublica:publicKey()}}));
app.post('/internal/auth/sesion-valida',async(req,res)=>{const p=z.object({sub:z.string().uuid(),sv:z.number().int().nonnegative()}).safeParse(req.body);if(!p.success)return error(res,401,'NO_AUTENTICADO','La sesión ya no es válida');const u=await db.usuario.findUnique({where:{id:p.data.sub},select:{estado:true,sessionVersion:true}});if(!u||u.estado!=='ACTIVO'||u.sessionVersion!==p.data.sv)return error(res,401,'NO_AUTENTICADO','La sesión ya no es válida');return res.status(204).end();});
registerPasswordResetRoutes(app, { db, error, autenticar, requerirRol });
const recoveryCleanup = setInterval(() => {
 limpiarSolicitudesRecuperacion(db).catch((cause) => {
  console.error('Falló la limpieza periódica de recuperación', { code: cause.code || 'ERROR' });
 });
}, 15 * 60 * 1000);
recoveryCleanup.unref();
app.get('/api/v1/usuarios',autenticar,requerirRol('ADMINISTRADOR'),async(req,res)=>{const pagina=Math.max(1,Number(req.query.pagina)||1),limite=Math.min(100,Math.max(1,Number(req.query.limite)||20));const where={};for(const f of ['facultad','carrera','rol','estado'])if(req.query[f])where[f]=req.query[f];if(req.query.busqueda)where.OR=['nombres','apellidos','correo','codigoEstudiantil'].map(k=>({[k]:{contains:String(req.query.busqueda),mode:'insensitive'}}));const [total,usuarios]=await Promise.all([db.usuario.count({where}),db.usuario.findMany({where,skip:(pagina-1)*limite,take:limite,orderBy:{apellidos:'asc'}})]);res.json({data:usuarios.map(publico),meta:{pagina,limite,total,totalPaginas:Math.ceil(total/limite)}});});
app.get('/api/v1/usuarios/:id',autenticar,requerirRol('ADMINISTRADOR'),async(req,res)=>{const u=await db.usuario.findUnique({where:{id:req.params.id}});return u?res.json({data:publico(u)}):error(res,404,'NO_ENCONTRADO','Usuario no encontrado');});
app.patch('/api/v1/usuarios/:id',autenticar,requerirRol('ADMINISTRADOR'),async(req,res)=>{const data={};for(const f of ['nombres','apellidos','facultad','carrera','estado'])if(req.body[f]!==undefined)data[f]=req.body[f];try{const u=await actualizarUsuarioProtegiendoUltimoAdmin(req.params.id,data);res.json({data:publico(u)});}catch(e){if(e.code==='P2025')return error(res,404,'NO_ENCONTRADO','Usuario no encontrado');if(e.code==='ULTIMO_ADMIN')return error(res,409,'ULTIMO_ADMIN','Debe quedar al menos un administrador activo');if(e.code==='P2034')return error(res,409,'CAMBIO_CONCURRENTE','Otro cambio de administrador ocurrió al mismo tiempo; vuelve a intentarlo');throw e;}});
app.patch('/api/v1/usuarios/:id/rol',autenticar,requerirRol('ADMINISTRADOR'),async(req,res)=>{if(req.params.id===req.usuario.sub)return error(res,422,'DATOS_INVALIDOS','No puedes cambiar tu propio rol');if(!['ESTUDIANTE','ADMINISTRADOR'].includes(req.body?.rol))return error(res,400,'DATOS_INVALIDOS','Rol inválido');try{const u=await actualizarUsuarioProtegiendoUltimoAdmin(req.params.id,{rol:req.body.rol});res.json({data:publico(u)});}catch(e){if(e.code==='P2025')return error(res,404,'NO_ENCONTRADO','Usuario no encontrado');if(e.code==='ULTIMO_ADMIN')return error(res,409,'ULTIMO_ADMIN','Debe quedar al menos un administrador activo');if(e.code==='P2034')return error(res,409,'CAMBIO_CONCURRENTE','Otro cambio de administrador ocurrió al mismo tiempo; vuelve a intentarlo');throw e;}});
app.post('/api/v1/usuarios/importar',autenticar,requerirRol('ADMINISTRADOR'),async(req,res)=>{const csv=String(req.body?.csv||'');if(!csv.trim())return error(res,400,'DATOS_INVALIDOS','Debes enviar el contenido CSV');const parseLine=line=>{const out=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&line[i+1]==='"'&&quoted){value+='"';i++;}else if(c==='"')quoted=!quoted;else if(c===','&&!quoted){out.push(value.trim());value='';}else value+=c;}out.push(value.trim());return out;};const lines=csv.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());if(lines.length<2)return error(res,400,'DATOS_INVALIDOS','El CSV debe incluir encabezado y al menos una fila');const headers=parseLine(lines[0]);const required=['nombres','apellidos','correo','codigoEstudiantil','facultad','carrera','contrasena'];if(required.some(h=>!headers.includes(h)))return error(res,400,'DATOS_INVALIDOS','Faltan columnas obligatorias');if(lines.length-1>2000)return error(res,400,'DATOS_INVALIDOS','El máximo es 2000 filas');let creados=0,omitidos=0;const errores=[];for(let i=1;i<lines.length;i++){try{const values=parseLine(lines[i]),row=Object.fromEntries(headers.map((h,j)=>[h,values[j]||'']));const parsed=registroSchema.safeParse(row);if(!parsed.success)throw new Error('Datos inválidos o incompletos');const {contrasena,...b}=parsed.data;const correo=b.correo.trim().toLowerCase(),dominio=(process.env.DOMINIO_CORREO_INSTITUCIONAL||'').trim().toLowerCase();const reglasIncumplidas=validarPoliticaContrasena(contrasena,{correo,codigoEstudiantil:b.codigoEstudiantil});if(reglasIncumplidas.length)throw new Error(`Contraseña no válida: ${reglasIncumplidas.join(', ')}`);if(dominio&&!correo.endsWith('@'+dominio))throw new Error('Correo no institucional');await db.usuario.create({data:{...b,correo,contrasenaHash:await bcrypt.hash(contrasena,12)}});creados++;}catch(e){omitidos++;errores.push({fila:i+1,motivo:e.code==='P2002'?'Correo o código duplicado':e.message||'Fila inválida'});}}res.json({data:{creados,omitidos,errores}});});
app.get('/internal/usuarios/conteo',async(req,res)=>{const facultades=String(req.query.facultades||'').split(',').filter(Boolean),carreras=String(req.query.carreras||'').split(',').filter(Boolean);const where={rol:'ESTUDIANTE',estado:'ACTIVO',...(facultades.length?{facultad:{in:facultades}}:{}),...(carreras.length?{carrera:{in:carreras}}:{})};const grupos=await db.usuario.groupBy({by:['facultad','carrera'],where,_count:{_all:true}});res.json({data:{total:await db.usuario.count({where}),porGrupo:grupos.map(g=>({facultad:g.facultad,carrera:g.carrera,total:g._count._all}))}});});
app.use((req,res)=>error(res,404,'NO_ENCONTRADO','Ruta no encontrada'));app.use((err,_req,res,_next)=>{const status=Number(err.statusCode||err.status);const clientError=Number.isInteger(status)&&status>=400&&status<500;console.error('Error de solicitud en identidad',{status:clientError?status:500,type:typeof err.type==='string'?err.type:typeof err.name==='string'?err.name:'ERROR'});return error(res,clientError?status:500,clientError?'DATOS_INVALIDOS':'ERROR_INTERNO',clientError?'La solicitud no tiene un formato válido':'Ocurrió un error interno');});
const server=app.listen(process.env.PORT||4001,()=>console.log('Identidad listo'));process.on('SIGTERM',async()=>{server.close();await db.$disconnect();});
