import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt'


async function connect() {
  return await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: 'over_math'
  });
}

async function register(connection, host, email, password) {
    const salt_round = 10;
    const hashedPassword = await bcrypt.hash(password, salt_round);

    const sqlQuery = 'INSERT INTO cuenta (correo, contrasena_hash, rol) VALUES (?, ?, "jugador")';

    try {
        const [result] = await connection.execute(sqlQuery, [email, hashedPassword]);
        return result;
    } catch (error) {
        console.error("Database Error:", error.message);
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





export default{
    connect, register, getQuestions, getScoreboard, setLoginUser
};
