import mysql from 'mysql2/promise'
import bcrypt from 'bcrypt'

const pool = mysql.createPool({
  host: '127.0.0.1',
  port: 3307,
  user: 'root',
  password: '',
  database: 'over_math'
})

async function connect() {
  return await pool.getConnection()
}

async function register(connection, email, password) {
  const saltRounds = 10
  const hashedPassword = await bcrypt.hash(password, saltRounds)
  const sql = 'INSERT INTO cuenta (correo, contrasena_hash) VALUES (?, ?)'
  const [result] = await connection.execute(sql, [email, hashedPassword])
  return result
}

async function getQuestions(connection, island, difficulty) {
  const sql = `
    SELECT *
    FROM pregunta p
    JOIN nivel n ON p.nivel = n.id_nivel
    JOIN isla i ON i.id_isla = n.isla
    WHERE i.nombre = ?
      AND n.dificultad = ?
  `
  const [rows] = await connection.query(sql, [island, difficulty])
  return { items: rows }
}

async function getScoreboard(connection) {
  const sql = `
    SELECT *
    FROM jugador
    ORDER BY score_global DESC
    LIMIT 10
  `
  const [rows] = await connection.query(sql)
  return { top_players: rows }
}

async function setLoginUser(connection, userId) {
  const sql = `
    INSERT INTO registro (fecha_hora_incicio, cuenta)
    VALUES (CURRENT_TIMESTAMP, ?)
  `
  const [result] = await connection.execute(sql, [userId])
  return result
}

async function login(connection, email, password) {
  const sql = 'SELECT id_cuenta, correo, contrasena_hash FROM cuenta WHERE correo = ?'
  const [results] = await connection.execute(sql, [email])

  if (results.length === 0) {
    return { ok: false, status: 404, error: 'user not found' }
  }

  const user = results[0]
  const match = await bcrypt.compare(password, user.contrasena_hash)

  if (!match) {
    return { ok: false, status: 401, error: 'invalid credentials' }
  }

  return {
    ok: true,
    message: 'login successful',
    user: { id: user.id_cuenta, email: user.correo }
  }
}

async function crearSolicitudVinculacion(connection, id_cuenta, id_jugador, parentezco) {
  const [tutorRows] = await connection.execute(
    'SELECT id_tutor FROM tutor WHERE cuenta = ?', [id_cuenta]
  )
  if (tutorRows.length === 0) {
    const err = new Error('No se encontró un tutor asociado a esta cuenta.')
    err.status = 404
    throw err
  }
  const id_tutor = tutorRows[0].id_tutor

  const [jugadorRows] = await connection.execute(
    'SELECT id_jugador FROM jugador WHERE id_jugador = ?', [id_jugador]
  )
  if (jugadorRows.length === 0) {
    const err = new Error('No se encontró un jugador con ese ID.')
    err.status = 404
    throw err
  }

  const [existingRows] = await connection.execute(
    `SELECT id_solicitud FROM solicitud_vinculacion
     WHERE id_tutor = ? AND id_jugador = ? AND estado = 'pendiente'`,
    [id_tutor, id_jugador]
  )
  if (existingRows.length > 0) {
    const err = new Error('Ya existe una solicitud pendiente para este jugador.')
    err.status = 409
    throw err
  }

  const [linkedRows] = await connection.execute(
    'SELECT id_jugador FROM tutor_jugador WHERE id_tutor = ? AND id_jugador = ?',
    [id_tutor, id_jugador]
  )
  if (linkedRows.length > 0) {
    const err = new Error('Ya estás vinculado a este jugador.')
    err.status = 409
    throw err
  }

  const [result] = await connection.execute(
    'INSERT INTO solicitud_vinculacion (id_tutor, id_jugador, parentezco) VALUES (?, ?, ?)',
    [id_tutor, id_jugador, parentezco]
  )
  return { id_solicitud: result.insertId }
}

async function getSolicitudesVinculacion(connection) {
  const sql = `
    SELECT
      sv.id_solicitud, sv.estado, sv.parentezco,
      sv.fecha_solicitud, sv.motivo_rechazo,
      t.id_tutor, t.primer_nombre AS tutor_nombre, t.apellidos AS tutor_apellidos,
      j.id_jugador, j.primer_nombre AS jugador_nombre, j.apellidos AS jugador_apellidos
    FROM solicitud_vinculacion sv
    JOIN tutor t ON sv.id_tutor = t.id_tutor
    JOIN jugador j ON sv.id_jugador = j.id_jugador
    ORDER BY
      CASE sv.estado WHEN 'pendiente' THEN 0 ELSE 1 END,
      sv.fecha_solicitud DESC
  `
  const [rows] = await connection.query(sql)
  return { solicitudes: rows }
}

async function resolverSolicitudVinculacion(connection, id, estado, motivo_rechazo, id_admin) {
  const [rows] = await connection.execute(
    `SELECT id_solicitud, id_tutor, id_jugador, parentezco, estado
     FROM solicitud_vinculacion WHERE id_solicitud = ?`,
    [id]
  )
  if (rows.length === 0) {
    const err = new Error('Solicitud no encontrada.')
    err.status = 404
    throw err
  }

  const solicitud = rows[0]
  if (solicitud.estado !== 'pendiente') {
    const err = new Error('Esta solicitud ya fue resuelta.')
    err.status = 409
    throw err
  }

  await connection.execute(
    `UPDATE solicitud_vinculacion
     SET estado = ?, motivo_rechazo = ?, fecha_resolucion = NOW(), id_admin = ?
     WHERE id_solicitud = ?`,
    [estado, motivo_rechazo || null, id_admin || null, id]
  )

  if (estado === 'rechazada') {
    return { message: 'Solicitud rechazada.' }
  }

  try {
    await connection.execute(
      'INSERT INTO tutor_jugador (id_jugador, id_tutor, parentezco) VALUES (?, ?, ?)',
      [solicitud.id_jugador, solicitud.id_tutor, solicitud.parentezco]
    )
    return { message: 'Solicitud aceptada. Tutor vinculado al jugador.' }
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return { message: 'Solicitud aceptada. La vinculación ya existía.' }
    }
    throw err
  }
}

async function endSession(connection, id_session) {
  const sql = `
    UPDATE registro
    SET fecha_hora_fin = NOW()
    WHERE id_registro = ? AND fecha_hora_fin IS NULL
  `
  const [result] = await connection.query(sql, [id_session])
  return result
}

export default {
  connect,
  register,
  getQuestions,
  getScoreboard,
  setLoginUser,
  login,
  crearSolicitudVinculacion,
  getSolicitudesVinculacion,
  resolverSolicitudVinculacion,
  endSession
}
