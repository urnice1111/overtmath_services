import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt'
import 'dotenv/config';


const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function connect() {
    return await pool.getConnection();
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
async function resolverSolicitudVinculacion(connection, id_solicitud, estado, motivo_rechazo, id_cuenta_admin) {
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

    const [adminRows] = await connection.execute(
        'SELECT id_administrador FROM administrador WHERE cuenta = ?',
        [id_cuenta_admin]
    );

    if (adminRows.length === 0) {
        const err = new Error('Administrador no encontrado.');
        err.status = 403;
        throw err;
    }

    const id_administrador = adminRows[0].id_administrador;

    await connection.execute(
        'UPDATE solicitud_vinculacion SET estado = ?, motivo_rechazo = ?, fecha_resolucion = NOW(), id_admin = ? WHERE id_solicitud = ?',
        [estado, motivo_rechazo || null, id_administrador, id_solicitud]
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
    const queryJugadoresActivos = 
    ` SELECT COUNT(DISTINCT j.id_jugador) AS jugadores_activos
      FROM jugador j
      JOIN cuenta c ON j.cuenta = c.id_cuenta
      JOIN historial_login hl ON hl.cuenta = c.id_cuenta
      WHERE hl.fecha_hora >= NOW() - INTERVAL 7 DAY
        AND hl.exito = 1;
    `;

    const queryPartidasTotales = 
    ` SELECT COUNT(id_partida) AS partidas_totales
      FROM partida
      WHERE fecha_hora >= NOW() - INTERVAL 7 DAY;
    `;

    const queryTiempoTotal = 
    ` SELECT COALESCE(SUM(tiempo_seg), 0) AS tiempo_total_jugado
      FROM partida
      WHERE fecha_hora >= NOW() - INTERVAL 15 DAY;
    `;

    const queryNivelesCompletados = 
    ` SELECT COUNT(*) AS niveles_completados
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


async function getAlertStudents(connection){
    const queryBajaPrecision = `SELECT
                                    j.id_jugador,
                                    j.primer_nombre,
                                    j.apellidos,
                                    'baja_precision' AS tipo_alerta,
                                    COUNT(*) AS total_intentos,
                                    SUM(CASE WHEN ip.es_correcto = 1 THEN 1 ELSE 0 END) AS intentos_correctos,
                                    ROUND(
                                        100 * SUM(CASE WHEN ip.es_correcto = 1 THEN 1 ELSE 0 END) / COUNT(*),
                                        2
                                    ) AS porcentaje_precision
                                FROM jugador j
                                JOIN partida p
                                    ON p.jugador = j.id_jugador
                                JOIN intento_pregunta ip
                                    ON ip.id_partida = p.id_partida
                                WHERE p.fecha_hora >= NOW() - INTERVAL 7 DAY
                                GROUP BY j.id_jugador, j.primer_nombre, j.apellidos
                                HAVING COUNT(*) > 0
                                AND (
                                    SUM(CASE WHEN ip.es_correcto = 1 THEN 1 ELSE 0 END) / COUNT(*)
                                ) < 0.60;
                                `
    const queryBajaParticipacion = `SELECT
                                        j.id_jugador,
                                        j.primer_nombre,
                                        j.apellidos,
                                        'baja_participacion' AS tipo_alerta,
                                        MAX(p.fecha_hora) AS ultima_partida
                                    FROM jugador j
                                    LEFT JOIN partida p
                                        ON p.jugador = j.id_jugador
                                    GROUP BY j.id_jugador, j.primer_nombre, j.apellidos
                                    HAVING MAX(p.fecha_hora) IS NULL
                                        OR MAX(p.fecha_hora) < NOW() - INTERVAL 7 DAY;`
    
    const queryAtascadoPorIsla = `SELECT
                                        j.id_jugador,
                                        j.primer_nombre,
                                        j.apellidos,
                                        i.id_isla,
                                        i.nombre AS isla,
                                        'atascado' AS tipo_alerta,
                                        COUNT(*) AS total_intentos_isla,
                                        SUM(CASE WHEN p.score_max >= n.puntaje_aceptable THEN 1 ELSE 0 END) AS victorias
                                    FROM jugador j
                                    JOIN partida p
                                        ON p.jugador = j.id_jugador
                                    JOIN nivel n
                                        ON n.id_nivel = p.nivel
                                    JOIN isla i
                                        ON i.id_isla = n.isla
                                    WHERE p.fecha_hora >= NOW() - INTERVAL 14 DAY
                                    GROUP BY j.id_jugador, j.primer_nombre, j.apellidos, i.id_isla, i.nombre
                                    HAVING COUNT(*) >= 3
                                    AND SUM(CASE WHEN p.score_max >= n.puntaje_aceptable THEN 1 ELSE 0 END) = 0;`
    
    const [jugadoresBajaPrecision] = await connection.execute(queryBajaPrecision);
    const [jugadoresBajaParticipacion] = await connection.execute(queryBajaParticipacion);
    const [jugadoresAtascados] = await connection.execute(queryAtascadoPorIsla);

    return [...jugadoresBajaPrecision, ...jugadoresBajaParticipacion, ...jugadoresAtascados];
}


async function getAllPlayers(connection){
    const sqlQuery=`SELECT
                        j.id_jugador,
                        j.primer_nombre,
                        j.apellidos,
                        j.score_global,

                        TIMESTAMPDIFF(DAY, ps.ultima_actividad, NOW()) AS ultima_actividad,

                        ROUND(COALESCE(ws.tiempo_semanal_horas, 0), 2) AS tiempo_semanal_horas,
                        ROUND(COALESCE(pr.precision_general, 0), 2) AS precision_general,

                        CASE
                            WHEN COALESCE(st.atascado, 0) = 1 THEN 'atascado'
                            WHEN ps.ultima_actividad IS NULL THEN 'inactivo'
                            WHEN ps.ultima_actividad < NOW() - INTERVAL 30 DAY THEN 'inactivo'
                            WHEN ps.ultima_actividad < NOW() - INTERVAL 7 DAY THEN 'baja_participacion'
                            ELSE 'activo'
                        END AS estado

                    FROM jugador j

                    LEFT JOIN (
                        SELECT
                            p.jugador,
                            MAX(p.fecha_hora) AS ultima_actividad
                        FROM partida p
                        GROUP BY p.jugador
                    ) AS ps
                        ON ps.jugador = j.id_jugador

                    LEFT JOIN (
                        SELECT
                            p.jugador,
                            SUM(p.tiempo_seg) / 3600 AS tiempo_semanal_horas
                        FROM partida p
                        WHERE p.fecha_hora >= NOW() - INTERVAL 7 DAY
                        GROUP BY p.jugador
                    ) AS ws
                        ON ws.jugador = j.id_jugador

                    LEFT JOIN (
                        SELECT
                            p.jugador,
                            100.0 * SUM(CASE WHEN ip.es_correcto = 1 THEN 1 ELSE 0 END) / COUNT(*) AS precision_general
                        FROM partida p
                        JOIN intento_pregunta ip
                            ON ip.id_partida = p.id_partida
                        GROUP BY p.jugador
                    ) AS pr
                        ON pr.jugador = j.id_jugador

                    LEFT JOIN (
                        SELECT
                            t.jugador,
                            1 AS atascado
                        FROM (
                            SELECT
                                p.jugador,
                                p.nivel
                            FROM partida p
                            JOIN nivel n
                                ON n.id_nivel = p.nivel
                            WHERE p.fecha_hora >= NOW() - INTERVAL 14 DAY
                            GROUP BY p.jugador, p.nivel
                            HAVING COUNT(*) >= 3
                            AND SUM(
                                CASE
                                    WHEN p.score_max >= n.puntaje_aceptable THEN 1
                                    ELSE 0
                                END
                            ) = 0
                        ) AS t
                        GROUP BY t.jugador
                    ) AS st
                        ON st.jugador = j.id_jugador

                    ORDER BY
                        CASE
                            WHEN COALESCE(st.atascado, 0) = 1 THEN 1
                            WHEN ps.ultima_actividad IS NULL THEN 2
                            WHEN ps.ultima_actividad < NOW() - INTERVAL 30 DAY THEN 2
                            WHEN ps.ultima_actividad < NOW() - INTERVAL 7 DAY THEN 3
                            ELSE 4
                        END,
                        j.score_global DESC,
                        j.primer_nombre ASC;`
    const [players] = await connection.execute(sqlQuery);

    return players;

}

async function getTutorDashboard(connection, idCuenta) {
    const sqlTutor = `SELECT id_tutor, primer_nombre, apellidos
         FROM tutor
         WHERE cuenta = ?`;
    const [tutorRows] = await connection.execute(sqlTutor, [idCuenta]);

    if (tutorRows.length === 0) {
        const err = new Error('No se encontro un tutor asociado a esta cuenta.');
        err.status = 404;
        throw err;
    }

    const tutor = tutorRows[0];

    const sqlSummary = 
    `SELECT
            COUNT(DISTINCT tj.id_jugador) AS total_jugadores,
            COALESCE(ROUND(AVG(j.score_global), 2), 0) AS promedio_score_global,
            COUNT(p.id_partida) AS total_partidas
         FROM tutor_jugador tj
         LEFT JOIN jugador j ON j.id_jugador = tj.id_jugador
         LEFT JOIN partida p ON p.jugador = tj.id_jugador
         WHERE tj.id_tutor = ?`;
    const [summaryRows] = await connection.execute(sqlSummary, [tutor.id_tutor]);

    const sqlWeekly = 
    `SELECT
            YEARWEEK(p.fecha_hora, 1) AS year_week,
            DATE_FORMAT(
                DATE_SUB(DATE(p.fecha_hora), INTERVAL WEEKDAY(p.fecha_hora) DAY),
                '%d/%m'
            ) AS semana_inicio,
            COALESCE(ROUND(AVG(p.score_max), 2), 0) AS puntaje_promedio,
            COUNT(DISTINCT p.jugador) AS participacion
         FROM partida p
         JOIN tutor_jugador tj ON tj.id_jugador = p.jugador
         WHERE tj.id_tutor = ?
           AND p.fecha_hora >= NOW() - INTERVAL 6 WEEK
         GROUP BY YEARWEEK(p.fecha_hora, 1), semana_inicio
         ORDER BY year_week`;
    const [weeklyRows] = await connection.execute(sqlWeekly, [tutor.id_tutor]);

    const sqlTopic = 
    `SELECT
            pr.tema,
            COALESCE(ROUND(100 * AVG(CASE WHEN ip.es_correcto = 1 THEN 1 ELSE 0 END), 2), 0) AS precision_pct,
            COUNT(*) AS total_intentos
         FROM intento_pregunta ip
         JOIN partida p ON p.id_partida = ip.id_partida
         JOIN pregunta pr ON pr.id_pregunta = ip.id_pregunta
         JOIN tutor_jugador tj ON tj.id_jugador = p.jugador
         WHERE tj.id_tutor = ?
         GROUP BY pr.tema
         ORDER BY precision_pct DESC`;
    const [topicRows] = await connection.execute(sqlTopic, [tutor.id_tutor]);

    const sqlTimeline = `SELECT
            DATE_FORMAT(p.fecha_hora, '%d/%m') AS fecha,
            CONCAT(j.primer_nombre, ' ', j.apellidos) AS jugador_nombre,
            i.tema AS tema,
            p.score_max AS score_max
         FROM partida p
         JOIN jugador j ON j.id_jugador = p.jugador
         JOIN nivel n ON n.id_nivel = p.nivel
         JOIN isla i ON i.id_isla = n.isla
         JOIN tutor_jugador tj ON tj.id_jugador = p.jugador
         WHERE tj.id_tutor = ?
         ORDER BY p.fecha_hora DESC
         LIMIT 8`;
    const [timelineRows] = await connection.execute(sqlTimeline, [tutor.id_tutor]);

    const summary = {
        tutorNombre: `${tutor.primer_nombre} ${tutor.apellidos}`.trim(),
        totalJugadores: Number(summaryRows[0]?.total_jugadores ?? 0),
        promedioScore: Number(summaryRows[0]?.promedio_score_global ?? 0),
        totalPartidas: Number(summaryRows[0]?.total_partidas ?? 0)
    };

    const weeklyProgress = weeklyRows.map((row, index) => ({
        semana: `Semana ${index + 1}`,
        etiqueta: row.semana_inicio,
        puntaje_promedio: Number(row.puntaje_promedio ?? 0),
        participacion: Number(row.participacion ?? 0)
    }));

    const topicAccuracy = topicRows.map((row) => ({
        tema: row.tema,
        precision_pct: Number(row.precision_pct ?? 0),
        total_intentos: Number(row.total_intentos ?? 0)
    }));

    const timeline = timelineRows.map((row) => ({
        fecha: row.fecha,
        titulo: `${row.jugador_nombre} en ${row.tema}`,
        detalle: `Partida registrada con puntaje ${Number(row.score_max ?? 0)}.`
    }));

    const weakestTopic = topicAccuracy.length > 0
        ? [...topicAccuracy].sort((a, b) => a.precision_pct - b.precision_pct)[0]
        : null;

    const tips = [
        weakestTopic
            ? `Refuerza el tema ${weakestTopic.tema}: precision actual ${weakestTopic.precision_pct}%.`
            : 'Registra mas actividad para obtener recomendaciones personalizadas.',
        'Practica 10 minutos diarios en la isla con menor precision.',
        'Reconoce mejoras semanales para mantener motivacion.'
    ];

    const badges = [
        {
            nombre: 'Jugadores Activos',
            valor: `${summary.totalJugadores}`,
            color: 'bg-emerald-500'
        },
        {
            nombre: 'Partidas Guiadas',
            valor: `${summary.totalPartidas}`,
            color: 'bg-sky-500'
        },
        {
            nombre: 'Promedio General',
            valor: `${summary.promedioScore}`,
            color: 'bg-amber-500'
        }
    ];

    return {
        summary,
        weeklyProgress,
        topicAccuracy,
        timeline,
        tips,
        badges
    };
}


async function getInactivePlayers(connection){
    const sqlQuery = `SELECT id_cuenta, correo, rol, fecha_creacion FROM cuenta WHERE rol = 'jugador' AND activo = 0;`
    const [cuentas] = await connection.execute(sqlQuery);
    return cuentas;
}

async function activarCuenta(connection, cuenta, condicion){
    const sqlQueryAceptar = `UPDATE cuenta SET activo=true WHERE id_cuenta=?`
    const sqlQueryRechazar = `DELETE FROM cuenta WHERE id_cuenta = ?`

    if (condicion == 'aceptar'){
            connection.execute(sqlQueryAceptar, [cuenta]);
            return {message: "cuenta aceptada"}
    } else{
        connection.execute(sqlQueryRechazar, [cuenta]);
        return {message: "cuenta rechazada y borrada"}
    }
}

export default {
  connect, register, getQuestions, getScoreboard, login, register_jugador, register_tutor,
  crearSolicitudVinculacion, getSolicitudesVinculacion, resolverSolicitudVinculacion, loginTutorAdmin,
  register_admin, savePartida, saveIntentoPregunta, getIslasProgreso, saveProgreso, getGeneralInfo,
  getTutorDashboard, getAlertStudents, getAllPlayers, getInactivePlayers, activarCuenta
};