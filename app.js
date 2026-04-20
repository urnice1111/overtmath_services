import express from 'express'
import db from './overmath_db.mjs'

const app = express()
const port = 3000

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

export default app
