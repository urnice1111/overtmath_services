const express = require('express')
const app = express()
const port = 3000

const mysql = require('mysql2')

const connection = mysql.createConnection({
  host: '127.0.0.1',
  port: 3307,
  user: 'root',
  password: '',
  database: 'over_math'
})

connection.connect()

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
