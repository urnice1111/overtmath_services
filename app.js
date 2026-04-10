const express = require('express')
const bcrypt = require('bcrypt');
const mysql = require('mysql2')

const app = express()
const port = 3000

const { connect } = require('node:http2')

const connection = mysql.createConnection({
  host: '127.0.0.1',
  port: 3307,
  user: 'root',
  password: '',
  database: 'redes'
})

connection.connect()

app.use(express.json())

app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: 'email or password missing'
    });
  }

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
          id: user.id,
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

app.post('/register', async (req, res) => {
    try{
      const {email, password} = req.body;

      if (!email || !password) {
        return res.status(400).json({
          error: "email or password missing"
        });
      }

      const salt_round = 10;
      const hashedPassword = await bcrypt.hash(password, salt_round)

      const sql = 'INSERT INTO cuenta (correo, contrasena_hash) VALUES (?, ?)';

      connection.execute(sql, [email, hashedPassword], (err, result) => {
        if(err){
          if (err.code == 'ER_DUP_ENTRY'){
            return res.status(409).json({
              error : "user already exists"
            });
          }
          console.error(err)
          return res.status(500).json({
            error: err.message
          });
        }

        return res.status(201).json({
          message: "user created succesfully"
        });
      });
    } catch(err){
      console.error(err)
      return res.status(500).json({
        error: err.message
      });
    }
});


app.get('/check_user', (req, res) => {

});


app.get('/get_questions/:island/:difficulty', (req, res) => {
    const { island, difficulty } = req.params;

    const sql = `
        SELECT *
        FROM pregunta p
        JOIN nivel n ON p.nivel = n.id_nivel
        JOIN isla i ON i.id_isla = n.isla
        WHERE i.nombre = ?
          AND n.dificultad = ?
    `;

    connection.query(sql, [island, difficulty], (err, rows) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
            return;
        }

        res.json({ items: rows });
    });
});

/*
  Get top N (5) players
*/
app.get('/get_scoreboard', (req, res) => {
  const sql = `
        SELECT *
        FROM jugador
        ORDER BY score_global DESC
        LIMIT 10;
        `;

  connection.query(sql, (err, rows) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
            return;
        }

        res.json({ top_players: rows });
    });
});


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
