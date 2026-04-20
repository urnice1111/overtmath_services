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
        console.log(result);
        return result;
    } catch (error) {
        console.error("Database Error:", error.message);
        throw error;
    }
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



export default{
    connect, register, getQuestions, getScoreboard, login, register_jugador, register_tutor
};
