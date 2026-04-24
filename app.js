import express from 'express'
import cors from 'cors'; 
import db from './overmath_db.mjs'

const app = express()
const port = 3000

app.use(cors())
app.use(express.json())

app.post('/register', async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'email or password missing' })
  }

  let connection
  try {
    connection = await db.connect()
    await db.register(connection, email, password)
    return res.status(201).json({ message: 'user created successfully' })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'user already exists' })
    }
    console.error(err)
    return res.status(500).json({ error: err.message })
  } finally {
    if (connection) connection.release()
  }
})

app.get('/get_questions/:island/:difficulty', async (req, res) => {
  const { island, difficulty } = req.params
  let connection

  try {
    connection = await db.connect()
    const result = await db.getQuestions(connection, island, difficulty)
    return res.json(result)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  } finally {
    if (connection) connection.release()
  }
})

app.get('/get_scoreboard', async (req, res) => {
  let connection

  try {
    connection = await db.connect()
    const result = await db.getScoreboard(connection)
    return res.json(result)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  } finally {
    if (connection) connection.release()
  }
})

app.put('/set_login_user', async (req, res) => {
  const { userId } = req.body

  if (!userId) {
    return res.status(400).json({ error: 'userId missing' })
  }

  let connection
  try {
    connection = await db.connect()
    const result = await db.setLoginUser(connection, userId)
    return res.status(201).json({
      message: 'session start recorded',
      registroId: result.insertId,
      userId
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  } finally {
    if (connection) connection.release()
  }
})

app.post('/login', async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'email or password missing' })
  }

  let connection
  try {
    connection = await db.connect()
    const result = await db.login(connection, email, password)

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error })
    }

    return res.status(200).json({
      message: result.message,
      user: result.user
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  } finally {
    if (connection) connection.release()
  }
})

// --- Solicitudes de vinculación tutor ↔ jugador ---

app.post('/solicitud_vinculacion', async (req, res) => {
  const { id_cuenta, id_jugador, parentezco } = req.body

  if (!id_cuenta || !id_jugador || !parentezco) {
    return res.status(400).json({ error: 'Faltan campos obligatorios (id_cuenta, id_jugador, parentezco).' })
  }

  let connection
  try {
    connection = await db.connect()
    const result = await db.crearSolicitudVinculacion(connection, id_cuenta, id_jugador, parentezco)
    return res.status(201).json({
      message: 'Solicitud enviada correctamente.',
      id_solicitud: result.id_solicitud
    })
  } catch (err) {
    console.error(err)
    return res.status(err.status || 500).json({ error: err.message })
  } finally {
    if (connection) connection.release()
  }
})

app.get('/solicitudes_vinculacion', async (req, res) => {
  let connection

  try {
    connection = await db.connect()
    const result = await db.getSolicitudesVinculacion(connection)
    return res.json(result)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  } finally {
    if (connection) connection.release()
  }
})

app.put('/solicitud_vinculacion/:id/resolver', async (req, res) => {
  const { id } = req.params
  const { estado, motivo_rechazo, id_admin } = req.body

  if (!estado || !['aceptada', 'rechazada'].includes(estado)) {
    return res.status(400).json({ error: 'Estado debe ser "aceptada" o "rechazada".' })
  }

  if (estado === 'rechazada' && !motivo_rechazo) {
    return res.status(400).json({ error: 'Debes indicar un motivo de rechazo.' })
  }

  let connection
  try {
    connection = await db.connect()
    const result = await db.resolverSolicitudVinculacion(connection, id, estado, motivo_rechazo, id_admin)
    return res.json(result)
  } catch (err) {
    console.error(err)
    return res.status(err.status || 500).json({ error: err.message })
  } finally {
    if (connection) connection.release()
  }
})

app.put('/end_session', async (req, res) => {
  const { id_session } = req.body
  let connection

  try {
    connection = await db.connect()
    await db.endSession(connection, id_session)
    return res.status(201).json({ message: 'Session ended successfully' })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  } finally {
    if (connection) connection.release()
  }
})

   if (process.env.AWS_LAMBDA_FUNCTION_NAME === undefined) {
      app.listen(port, () => {
        console.log(`Server listening on port ${port}`)
      })
    }

// Endpoint para guardar progreso
app.post('/save_progress', async (req, res) => {
  const { jugador, score_max, tiempo_seg, fecha_hora, nivel, intentos } = req.body;

  if (!jugador || !nivel || !intentos) {
    return res.status(400).json({ error: "Faltan campos obligatorios (jugador, nivel, intentos)." });
  }

  let connection;
  try {
    connection = await db.connect();

    // Validar que el jugador existe
    const [jugadorRows] = await connection.execute(
      'SELECT id_jugador FROM jugador WHERE id_jugador = ?',
      [jugador]
    );

    if (jugadorRows.length === 0) {
      return res.status(400).json({ error: `El jugador ${jugador} no existe.` });
    }


    // Guardar partida (siempre crea una nueva fila con id_partida AUTO_INCREMENT)
    const partidaResult = await db.savePartida(connection, {
      jugador,
      score_max,
      tiempo_seg,
      fecha_hora,
      nivel
    });

    const id_partida = partidaResult.insertId;

    // Guardar intentos asociados a la partida recién creada
    for (const intento of intentos) {
      await db.saveIntentoPregunta(connection, {
        id_partida,
        id_pregunta: intento.id_pregunta,
        respuesta_usuario: intento.respuesta_usuario,
        es_correcto: intento.es_correcto,
        tiempo_respuesta_seg: intento.tiempo_respuesta_seg
      });
    }

    await db.saveProgreso(connection, {
      id_jugador: jugador,
      id_nivel: nivel,
      id_partida
    });

    return res.status(201).json({ message: 'Progreso guardado correctamente', id_partida });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

export default app;