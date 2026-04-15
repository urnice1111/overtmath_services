import express from 'express'
import mysql from 'mysql2'
import db from './overmath_db.mjs'

const app = express()
const port = process.env.PORT ?? 8080;
const ipAddress = process.env.C9_HOSTNAME ?? 'localhost';

app.use(express.json())
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


app.put('/set_login_user', async (req, res) => {
  const { deviceType, userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId missing' });
  }

  let connection;
  let host = `https://${req.hostname}`;

  try{
    connection = await db.connect();
    const result = await db.setLoginUser(connection, host, userId, deviceType);

    return res.status(201).json({
      message: 'login set successfully',
    });

  }catch(err){
      const {name, message} = err;
      res.status(500).json({name, message});
  } finally {
    if (connection){
      await connection.end();
    }
  }
});













app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: 'email or password missing'
    });
  }
//a
  const sql = 'SELECT id_cuenta, correo, contrasena_hash FROM cuenta WHERE correo = ?';

  connection.execute(sql, [email], async (err, results) => {
    if (err) {
      return res.status(500).json({
        error: err.message
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        error: 'user not found'
      });
    }

    const user = results[0];

    try {
      const match = await bcrypt.compare(password, user.contrasena_hash);

      if (!match) {
        return res.status(401).json({
          error: 'invalid credentials'
        });
      }

      return res.status(200).json({
        message: 'login successful',
        user: {
          id: user.id_cuenta,
          email: user.correo
        }
      });

    } catch (error) {
      return res.status(500).json({
        error: error.message
      });
    }
  });
});

app.put('/end_session', (req, res) => {
  const { id_session } = req.body;
  const sql = `UPDATE registro
             SET fecha_hora_fin = NOW()
             WHERE id_registro = ? AND fecha_hora_fin IS NULL`;
  connection.query(sql, [id_session], (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    } else {
      res.status(201).json({ message: "Session ended successfully" });
    }
  });
});


if (process.env.AWS_LAMBDA_FUNCTION_NAME === undefined) {
  app.listen(port, () => {
    console.log(
      `http://${ ipAddress }:${ port }`);
  });
}



export default app;