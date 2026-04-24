import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt'
import 'dotenv/config';


async function connect() {
  return await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,                                                // puerto por defecto
    user: process.env.MYSQL_USER,                                             // tu usuario
    password: process.env.MYSQL_PASSWORD,                              // tu contraseña
    database: process.env.MYSQL_DB_NAME,                                     // nombre de la base
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
}

async function register(connection, host, email, password) {
    const salt_round = 10;
    const hashedPassword = await bcrypt.hash(password, salt_round);

    const sqlQuery = 'INSERT INTO cuenta (correo, contrasena_hash, rol) VALUES (?, ?, "jugador")';

    try {
        const [result] = await connection.execute(sqlQuery, [email, hashedPassword]);
        console.log(result);
        return result;
    } catch (error) {
        console.error("Database Error:", error.message);
        throw error;
    }
}

async function crearSolicitudVinculacion(connection, id_cuenta, id_jugador, parentezco) {
    const [tutorRows] = await connection.execute(
        'SELECT id_tutor FROM tutor WHERE cuenta = ?',
        [id_cuenta]
    );

    if (tutorRows.length === 0) {
        const err = new Error('No se encontró un tutor asociado a esta cuenta.');
        err.status = 404;
        throw err;
    }

    const id_tutor = tutorRows[0].id_tutor;

    const [jugadorRows] = await connection.execute(
        'SELECT id_jugador FROM jugador WHERE id_jugador = ?',
        [id_jugador]
    );

    if (jugadorRows.length === 0) {
        const err = new Error('No se encontró un jugador con ese ID.');
        err.status = 404;
        throw err;
    }

    const [existingRows] = await connection.execute(
        "SELECT id_solicitud FROM solicitud_vinculacion WHERE id_tutor = ? AND id_jugador = ? AND estado = 'pendiente'",
        [id_tutor, id_jugador]
    );

    if (existingRows.length > 0) {
        const err = new Error('Ya existe una solicitud pendiente para este jugador.');
        err.status = 409;
        throw err;
    }

    const [linkedRows] = await connection.execute(
        'SELECT id_jugador FROM tutor_jugador WHERE id_tutor = ? AND id_jugador = ?',
        [id_tutor, id_jugador]
    );

    if (linkedRows.length > 0) {
        const err = new Error('Ya estás vinculado a este jugador.');
        err.status = 409;
        throw err;
    }

    const [result] = await connection.execute(
        'INSERT INTO solicitud_vinculacion (id_tutor, id_jugador, parentezco) VALUES (?, ?, ?)',
        [id_tutor, id_jugador, parentezco]
    );

    return { id_solicitud: result.insertId };
}

async function getSolicitudesVinculacion(connection) {
    const [rows] = await connection.execute(`
        SELECT
            sv.id_solicitud,
            sv.estado,
            sv.parentezco,
            sv.fecha_solicitud,
            sv.motivo_rechazo,
            t.id_tutor,
            t.primer_nombre AS tutor_nombre,
            t.apellidos     AS tutor_apellidos,
            j.id_jugador,
            j.primer_nombre AS jugador_nombre,
            j.apellidos     AS jugador_apellidos
        FROM solicitud_vinculacion sv
        JOIN tutor   t ON sv.id_tutor   = t.id_tutor
        JOIN jugador j ON sv.id_jugador = j.id_jugador
        ORDER BY
            CASE sv.estado WHEN 'pendiente' THEN 0 ELSE 1 END,
            sv.fecha_solicitud DESC
    `);

    return { solicitudes: rows };
}

async function resolverSolicitudVinculacion(connection, id_solicitud, estado, motivo_rechazo, id_admin) {
    const [rows] = await connection.execute(
        'SELECT id_solicitud, id_tutor, id_jugador, parentezco, estado FROM solicitud_vinculacion WHERE id_solicitud = ?',
        [id_solicitud]
    );

    if (rows.length === 0) {
        const err = new Error('Solicitud no encontrada.');
        err.status = 404;
        throw err;
    }

    const solicitud = rows[0];

    if (solicitud.estado !== 'pendiente') {
        const err = new Error('Esta solicitud ya fue resuelta.');
        err.status = 409;
        throw err;
    }

    await connection.execute(
        'UPDATE solicitud_vinculacion SET estado = ?, motivo_rechazo = ?, fecha_resolucion = NOW(), id_admin = ? WHERE id_solicitud = ?',
        [estado, motivo_rechazo || null, id_admin || null, id_solicitud]
    );

    if (estado === 'aceptada') {
        try {
            await connection.execute(
                'INSERT INTO tutor_jugador (id_jugador, id_tutor, parentezco) VALUES (?, ?, ?)',
                [solicitud.id_jugador, solicitud.id_tutor, solicitud.parentezco]
            );
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return { message: 'Solicitud aceptada. La vinculación ya existía.' };
            }
            throw err;
        }
        return { message: 'Solicitud aceptada. Tutor vinculado al jugador.' };
    }

    return { message: 'Solicitud rechazada.' };
}

async function register_jugador(connection, email, username, password, name, last_name, date) {
    const salt_round = 10;
    const hashedPassword = await bcrypt.hash(password, salt_round);

    const sqlQuery = 'CALL registrar_jugador(?, ?, ?, ?, ?, ?);';

    try {
        const [result] = await connection.execute(sqlQuery, [email, hashedPassword, name, last_name, username, date]);
        console.log(result);
        return result;
    } catch (error) {
        console.error("Database Error:", error.message);
        throw error;
    }
}

async function register_tutor(connection, email, password, name, last_name, number){
    const salt_round = 10;
    const hashedPassword = await bcrypt.hash(password, salt_round);

    const sqlQuery = 'CALL registrar_tutor (?, ?, ?, ?, ?);';

    try{
        const [result] = await connection.execute(sqlQuery, [email, hashedPassword, name, last_name, number]);
        console.log(result);
        return result;
    } catch (error){
        console.log(error.message);
        throw error;
    }
}

async function getQuestions(connection, host, island, difficulty){
    const sqlQuery = `
        SELECT *
        FROM pregunta p
        JOIN nivel n ON p.nivel = n.id_nivel
        JOIN isla i ON i.id_isla = n.isla
        WHERE i.nombre = ?
          AND n.dificultad = ?
    `;

    const [rows] = await connection.execute(sqlQuery, [island, difficulty]);
    let result = [];
    for (let row of rows){
        result.push({
            id_pregunta: row.id_pregunta,
            problema: row.problema,
            nivel: row.nivel,
            respuesta_correcta: row.respuesta_correcta
        });
    }
    return result;
}

async function getScoreboard(connection, host){
    const sqlQuery = `
        SELECT *
        FROM jugador
        ORDER BY score_global DESC
        LIMIT 10;
        `;
    const [rows] = await connection.execute(sqlQuery);
    let result = [];
    for(let row of rows){
        result.push({
            score_global: row.score_global,
            nombre_usuario: row.nombre_usuario
        });
    }
    return result;
}

/*
    Auxiliary method for login() that insert into the historial_login table
*/
async function setLoginUser(connection, host, userId, deviceType){
    const sqlQuery = `
        INSERT INTO historial_login (fecha_hora, exito, dispositivo, cuenta)
        VALUES (CURRENT_TIMESTAMP, true, ?, ?)
    `;

    try {
        const [result] = await connection.execute(sqlQuery, [deviceType, userId]);
        return result;
    } catch (error) {
        console.error("Database Error:", error.message);
        throw error;
    }
}

/*
    Main method for user loing that first validated credentials and then
    calls setLoginUser() for updating the historial_login table
*/
async function login(connection, host, email, password, deviceType) {
    const sqlQuery = `
        SELECT id_cuenta, correo, contrasena_hash
        FROM cuenta
        WHERE correo = ?
    `;

    try {
        const [rows] = await connection.execute(sqlQuery, [email]);

        if (rows.length === 0) {
            return { ok: false, message: 'User not found' };
        }

        const user = rows[0];
        const match = await bcrypt.compare(password, user.contrasena_hash);

        if (!match) {
            return { ok: false, message: 'Invalid password' };
        }

        await setLoginUser(connection, host, user.id_cuenta, deviceType);

        return {
            ok: true,
            user: {
                id_cuenta: user.id_cuenta,
                correo: user.correo
            }
        };

    } catch (error) {
        console.error("Database error:", error);
        throw error;
    }
}

async function register_admin(connection, email, password, name, last_name) {
    const salt_round = 10;
    const hashedPassword = await bcrypt.hash(password, salt_round);

    const sqlCuenta = 'INSERT INTO cuenta (correo, contrasena_hash, rol) VALUES (?, ?, "admin")';
    const [cuentaResult] = await connection.execute(sqlCuenta, [email, hashedPassword]);

    const id_cuenta = cuentaResult.insertId;

    const sqlAdmin = 'INSERT INTO administrador (primer_nombre, apellidos, cuenta) VALUES (?, ?, ?)';
    await connection.execute(sqlAdmin, [name, last_name, id_cuenta]);

    return { id_cuenta };
}

async function loginTutorAdmin(connection, email, password, deviceType, rol) {
    const sqlQuery = `
        SELECT id_cuenta, correo, contrasena_hash, rol
        FROM cuenta
        WHERE correo = ?
    `;

    const [rows] = await connection.execute(sqlQuery, [email]);

    if (rows.length === 0) {
        return { ok: false, status: 404, error: 'Usuario no encontrado.' };
    }

    const user = rows[0];

    const match = await bcrypt.compare(password, user.contrasena_hash);
    if (!match) {
        return { ok: false, status: 401, error: 'Credenciales incorrectas.' };
    }

    if (user.rol !== rol) {
        return { ok: false, status: 403, error: `Esta cuenta no tiene el rol de ${rol}.` };
    }

    await setLoginUser(connection, null, user.id_cuenta, deviceType);

    return {
        ok: true,
        user: {
            id_cuenta: user.id_cuenta,
            correo: user.correo
        }
    };
}

// Función para guardar partida
async function savePartida(connection, { jugador, score_max, tiempo_seg, fecha_hora, nivel }) {
  const [result] = await connection.execute(
    `INSERT INTO partida (score_max, fecha_hora, tiempo_seg, nivel, jugador)
     VALUES (?, ?, ?, ?, ?)`,
    [score_max, fecha_hora, tiempo_seg, nivel, jugador]
  );
  return result;
}

// Función para guardar intento de pregunta
async function saveIntentoPregunta(connection, { id_partida, id_pregunta, respuesta_usuario, es_correcto, tiempo_respuesta_seg }) {
  const [result] = await connection.execute(
    `INSERT INTO intento_pregunta 
     (id_partida, id_pregunta, respuesta_usuario, es_correcto, tiempo_respuesta_seg) 
     VALUES (?, ?, ?, ?, ?)`,
    [id_partida, id_pregunta, respuesta_usuario, es_correcto, tiempo_respuesta_seg]
  );
  return result;
}


async function getIslasProgreso(connection){
    const sqlQuery = `SELECT
                        j.id_jugador,
                        j.primer_nombre AS estudiante,
                        COALESCE(MAX(i.nombre = 'isla_suma'), 0)            AS isla_suma,
                        COALESCE(MAX(i.nombre = 'isla_resta'), 0)           AS isla_resta,
                        COALESCE(MAX(i.nombre = 'isla_multiplicacion'), 0)  AS isla_multiplicacion,
                        COALESCE(MAX(i.nombre = 'isla_division'), 0)        AS isla_division,
                        COALESCE(MAX(i.nombre = 'isla_todos'), 0)           AS isla_todos
                        FROM jugador j
                        LEFT JOIN partida p ON p.jugador = j.id_jugador
                        LEFT JOIN nivel   n ON n.id_nivel = p.nivel
                        LEFT JOIN isla    i ON i.id_isla  = n.isla
                        GROUP BY j.id_jugador, j.primer_nombre;`
    const [rows] =  await connection.execute(sqlQuery);

    const  a = rows.map(row => ({
        estudiante: row.estudiante,
        islas: {
            isla_suma: row.isla_suma ? true: false,
            isla_resta: row.isla_resta ? true: false,
            isla_multiplicacion: row.isla_multiplicacion ? true: false,
            isla_division: row.isla_division ? true: false,
            isla_todos: row.isla_todos ? true: false
        }
    })); 
    
    return a;
}

// Función para guardar progreso
async function saveProgreso(connection, { id_jugador, id_nivel, id_partida }) {
  const [result] = await connection.execute(
    `INSERT INTO progreso (id_jugador, id_nivel, id_partida)
     VALUES (?, ?, ?)`,
    [id_jugador, id_nivel, id_partida]
  );
  return result;
}

async function getGeneralInfo(connection){
    const queryJugadoresActivos = `
      SELECT COUNT(DISTINCT j.id_jugador) AS jugadores_activos
      FROM jugador j
      JOIN cuenta c ON j.cuenta = c.id_cuenta
      JOIN historial_login hl ON hl.cuenta = c.id_cuenta
      WHERE hl.fecha_hora >= NOW() - INTERVAL 7 DAY
        AND hl.exito = 1;
    `;

    const queryPartidasTotales = `
      SELECT COUNT(id_partida) AS partidas_totales
      FROM partida
      WHERE fecha_hora >= NOW() - INTERVAL 7 DAY;
    `;

    const queryTiempoTotal = `
      SELECT COALESCE(SUM(tiempo_seg), 0) AS tiempo_total_jugado
      FROM partida
      WHERE fecha_hora >= NOW() - INTERVAL 15 DAY;
    `;

    const queryNivelesCompletados = `
      SELECT COUNT(*) AS niveles_completados
      FROM partida p
      JOIN nivel n ON p.nivel = n.id_nivel
      WHERE p.score_max >= n.puntaje_aceptable
        AND p.fecha_hora >= NOW() - INTERVAL 7 DAY;
    `;

    const [rowsJugadoresActivos] = await connection.execute(queryJugadoresActivos);
    const [rowsPartidasTotales] = await connection.execute(queryPartidasTotales);
    const [rowsTiempoTotal] = await connection.execute(queryTiempoTotal);
    const [rowsNivelesCompletados] = await connection.execute(queryNivelesCompletados);

    const jugadoresActivos = Number(rowsJugadoresActivos[0].jugadores_activos ?? 0);
    const partidasTotales = Number(rowsPartidasTotales[0].partidas_totales ?? 0);
    const tiempoTotal = Number((rowsTiempoTotal[0].tiempo_total_jugado/60/60).toFixed(2) ?? 0);
    const nivelesCompletados = Number(rowsNivelesCompletados[0].niveles_completados ?? 0);

    return [
        {key: "jugadores_activos", stat_number: jugadoresActivos, stat_label: "Jugadores Activos"},
        {key: "partidas_totales", stat_number: partidasTotales, stat_label: "Partidas Jugadas"},
        {key: "tiempo_total", stat_number: tiempoTotal, stat_label: "Tiempo Jugado"},
        {key: "nivelesCompletados", stat_number: nivelesCompletados, stat_label: "Niveles completados"}
    ]
}

export default {
  connect, register, getQuestions, getScoreboard, login, register_jugador, register_tutor,
  crearSolicitudVinculacion, getSolicitudesVinculacion, resolverSolicitudVinculacion, loginTutorAdmin,
  register_admin, savePartida, saveIntentoPregunta, getIslasProgreso, saveProgreso, getGeneralInfo
};