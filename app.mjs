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





if (process.env.AWS_LAMBDA_FUNCTION_NAME === undefined) {
  app.listen(port, () => {
    console.log(
      `http://${ ipAddress }:${ port }`);
  });
}



export default app;