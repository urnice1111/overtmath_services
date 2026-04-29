import express from 'express'
import mysql from 'mysql2'
import cors from 'cors'
import db from './overmath_db.mjs'

const app = express()
const port = process.env.PORT ?? 8080;
const ipAddress = process.env.C9_HOSTNAME ?? 'localhost';

app.use(cors())
app.use(express.json());

app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  let connection;
  let host = 'https://${req.hostname}';

  try {
    if (!email || !password) {
      return res.status(400).json({
        error: 'email or password missing'
      });
    }

    connection = await db.connect();
    await db.register(connection, host, email, password);

    return res.status(201).json({
      message: 'user created successfully'
    });

  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'user already exists'
      });
    }

    console.error(err);
    return res.status(500).json({
      error: err.message
    });

  } finally {
    if (connection) {
      await connection.end();
    }
  }
});

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

app.get('/get_questions/:island/:difficulty', async (req, res) => {
    const { island, difficulty } = req.params;
    let connection;
    let host = `https://${req.hostname}`;

    try {
      connection = await db.connect();
      const result = await db.getQuestions(connection, host, island, difficulty);
      res.json(result);

    } catch(err) {
        const {name, message} = err;
        res.status(500).json({name, message});
    } finally {
      if (connection){
        await connection.end();
      }
    }
});

/*
  Get top N (5) players
*/
app.get('/get_scoreboard', async (req, res) => {
  let connection;
  let host = `https://${req.hostname}`;

  try{
    connection = await db.connect();
    const result = await db.getScoreboard(connection, host);
    res.json(result);
  } catch(err){
      const {name, message} = err;
      res.status(500).json({name, message});
  } finally {
    if (connection){
      await connection.end();
    }
  }
});
app.post('/register_admin', async (req, res) => {
  const { email, password, name, last_name } = req.body

  if (!email || !password || !name || !last_name) {
    return res.status(400).json({ error: 'Faltan campos obligatorios (email, password, name, last_name).' })
  }

  let connection
  try {
    connection = await db.connect()
    const result = await db.register_admin(connection, email, password, name, last_name)
    return res.status(201).json({
      message: 'Administrador registrado exitosamente.',
      id_cuenta: result.id_cuenta
    })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' })
    }
    console.error(err)
    return res.status(500).json({ error: err.message })
  } finally {
    if (connection) connection.release()
  }
})

app.post('/login_tutor_admin', async (req, res) => {
  const { email, password, deviceType, rol } = req.body

  if (!email || !password || !rol) {
    return res.status(400).json({ error: 'Faltan campos obligatorios (email, password, rol).' })
  }

  if (!['tutor', 'admin'].includes(rol)) {
    return res.status(400).json({ error: 'Rol debe ser "tutor" o "admin".' })
  }

  let connection
  try {
    connection = await db.connect()
    const result = await db.loginTutorAdmin(connection, email, password, deviceType || 'web', rol)

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error })
    }

    return res.status(200).json({
      result: {
        ok: true,
        user: result.user
      }
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  } finally {
    if (connection) connection.release()
  }
})

app.post('/login', async (req, res) => {
  const { email, password, deviceType } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: 'email or password missing'
    });
  }

  let connection;
  let host = `https://${req.hostname}`;

  try {
    connection = await db.connect();
    const result = await db.login(connection, host, email, password, deviceType);

    if (!result.ok) {
      return res.status(401).json({ result });
    }

    return res.status(201).json({ result });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});



app.post('/register_jugador', async (req, res) => {
  const { email, username, password, name, last_name, date } = req.body;

  let connection;
  let host = `https://${req.hostname}`;

  try {
    connection = await db.connect();
    const result = await db.register_jugador(
      connection,
      email,
      username,
      password,
      name,
      last_name,
      date
    );

    return res.status(201).json({
      message: 'Jugador registrado correctamente'
    });
  } catch (error) {
    console.error("Register Error:", error.message);
    return res.status(500).json({ error: error.message });
  } finally {
    if (connection) connection.release();
  }
});


app.post('/register_tutor', async (req, res) => {
  const { email, password, name, last_name, number } = req.body;

  let connection;
  let host = `https://${req.hostname}`;

  try {
    connection = await db.connect();
    const result = await db.register_tutor(
      connection,
      email,
      password,
      name,
      last_name,
      number
    );

    return res.status(201).json({
      message: 'Tutor registrado correctamente'
    });
  } catch (error) {
    console.error("Register Error:", error.message);
    return res.status(500).json({ error: error.message });
  } finally {
    if (connection) connection.release();
  }
});



// app.put('/end_session', (req, res) => {
//   const { id_session } = req.body;
//   const sql = `UPDATE registro
//             SET fecha_hora_fin = NOW()
//             WHERE id_registro = ? AND fecha_hora_fin IS NULL`;
//   connection.query(sql, [id_session], (err, result) => {
//     if (err) {
//       console.error(err);
//       res.status(500).json({ error: err.message });
//     } else {
//       res.status(201).json({ message: "Session ended successfully" });
//     }
//   });
// });

app.post('/save_progress', async (req, res) => {
  const { jugador, score_max, tiempo_seg, fecha_hora, nivel, resultado, intentos } = req.body;

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
      nivel,
      resultado
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


if (process.env.AWS_LAMBDA_FUNCTION_NAME === undefined) {
  app.listen(port, () => {
    console.log(
      `http://${ ipAddress }:${ port }`);
  });
}



export default app;