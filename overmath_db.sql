--SET FOREIGN_KEY_CHECKS = 0;

DROP DATABASE IF EXISTS over_math;
CREATE DATABASE over_math;
USE over_math;

DROP TABLE IF EXISTS cuenta;
CREATE TABLE cuenta(
	id_cuenta INT AUTO_INCREMENT PRIMARY KEY,
	correo VARCHAR(100) NOT NULL UNIQUE,
	contrasena_hash VARCHAR(255) NOT NULL,
	rol ENUM('admin', 'tutor', 'jugador') NOT NULL,
	activo BOOL DEFAULT FALSE,
	fecha_creacion DATE DEFAULT (CURRENT_DATE)
);


DROP TABLE IF EXISTS historial_login;
CREATE TABLE historial_login(
	id_registro INT AUTO_INCREMENT PRIMARY KEY,
	fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
	exito BOOL DEFAULT FALSE,
	dispositivo VARCHAR(100),
	cuenta INT NOT NULL,
	FOREIGN KEY (cuenta) REFERENCES cuenta(id_cuenta)
);

DROP TABLE IF EXISTS administrador;
CREATE TABLE administrador(
	id_administrador INT AUTO_INCREMENT PRIMARY KEY,
	primer_nombre VARCHAR(100) NOT NULL,
	apellidos VARCHAR(150) NOT NULL,
	cuenta INT NOT NULL UNIQUE,
	FOREIGN KEY (cuenta) REFERENCES cuenta(id_cuenta)
);


DROP TABLE IF EXISTS tutor;
CREATE TABLE tutor(
	id_tutor INT AUTO_INCREMENT PRIMARY KEY,
	primer_nombre VARCHAR(100) NOT NULL,
	apellidos VARCHAR(150) NOT NULL,
	telefono VARCHAR(25),
	cuenta INT NOT NULL UNIQUE,
	FOREIGN KEY (cuenta) REFERENCES cuenta(id_cuenta)
);


DROP TABLE IF EXISTS jugador;
CREATE TABLE jugador(
	id_jugador INT AUTO_INCREMENT PRIMARY KEY,
	primer_nombre VARCHAR(100) NOT NULL,
	apellidos VARCHAR(150) NOT NULL,
	score_global INT DEFAULT 0,
	nombre_usuario VARCHAR(20),
	fecha_nacimiento DATE,
	tutorial_completado BOOL DEFAULT false,
	cuenta INT NOT NULL UNIQUE,
	FOREIGN KEY (cuenta) REFERENCES cuenta(id_cuenta)
);


DROP TABLE IF EXISTS tutor_jugador;
CREATE TABLE tutor_jugador(
	id_jugador INT NOT NULL,
	id_tutor INT NOT NULL,
	parentezco VARCHAR(50),

	PRIMARY KEY(id_jugador, id_tutor),

	FOREIGN KEY (id_jugador) REFERENCES jugador(id_jugador),
	FOREIGN KEY (id_tutor) REFERENCES tutor(id_tutor)
);


DROP TABLE IF EXISTS personaje;
CREATE TABLE personaje(
	id_personaje INT AUTO_INCREMENT PRIMARY KEY,
	nombre_asset VARCHAR(100) NOT NULL,
	descripcion TEXT
);


DROP TABLE IF EXISTS jugador_personaje;
CREATE TABLE jugador_personaje(
	id_personaje INT NOT NULL,
	id_jugador INT NOT NULL,
	fecha_desbloqueo DATE DEFAULT (CURRENT_DATE),

	PRIMARY KEY (id_personaje, id_jugador),

	FOREIGN KEY (id_personaje) REFERENCES personaje(id_personaje),
	FOREIGN KEY (id_jugador) REFERENCES jugador(id_jugador)
);


DROP TABLE IF EXISTS isla;
CREATE TABLE isla(
	id_isla INT AUTO_INCREMENT PRIMARY KEY,
	nombre VARCHAR(50) NOT NULL,
	tema VARCHAR(50) NOT NULL,
	orden INT
);


DROP TABLE IF EXISTS nivel;
CREATE TABLE nivel(
	id_nivel INT AUTO_INCREMENT PRIMARY KEY,
	puntaje_aceptable INT NOT NULL,
	dificultad VARCHAR(10) NOT NULL,
	isla INT NOT NULL,

	FOREIGN KEY (isla) REFERENCES isla(id_isla)
);


DROP TABLE IF EXISTS partida;
CREATE TABLE partida(
	id_partida INT AUTO_INCREMENT PRIMARY KEY,
	score_max INT DEFAULT 0,
	fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	tiempo_seg INT,
	nivel INT NOT NULL,
	jugador INT NOT NULL,

	UNIQUE KEY uk_jugador_nivel (jugador, nivel),

	FOREIGN KEY (nivel) REFERENCES nivel(id_nivel),
	FOREIGN KEY (jugador) REFERENCES jugador(id_jugador)
);


DROP TABLE IF EXISTS pregunta;
CREATE TABLE pregunta(
	id_pregunta INT NOT NULL PRIMARY KEY,
	subtema VARCHAR(50),
	tema VARCHAR(50) NOT NULL,
	problema VARCHAR(50) NOT NULL,
	nivel INT NOT NULL,
	respuesta_correcta INT NOT NULL,

	FOREIGN KEY (nivel) REFERENCES nivel(id_nivel)
);


DROP TABLE IF EXISTS intento_pregunta;
CREATE TABLE intento_pregunta(
	id_pregunta INT NOT NULL,
	id_partida INT NOT NULL,
	respuesta_usuario VARCHAR(50),
	es_correcto BOOL NOT NULL,
	tiempo_respuesta_seg INT NOT NULL,

	PRIMARY KEY ip_primary_key (id_pregunta, id_partida),

	FOREIGN KEY (id_pregunta) REFERENCES pregunta(id_pregunta),
	FOREIGN KEY (id_partida) REFERENCES partida(id_partida)
);


DROP TABLE IF EXISTS progreso;
CREATE TABLE progreso(
	id_nivel INT NOT NULL,
	id_partida INT NOT NULL,
	id_jugador INT NOT NULL,

	PRIMARY KEY npj_primary_key (id_nivel, id_partida, id_jugador),

	FOREIGN KEY (id_nivel) REFERENCES nivel(id_nivel),
	FOREIGN KEY (id_partida) REFERENCES partida(id_partida),
	FOREIGN KEY (id_jugador) REFERENCES jugador(id_jugador)
);


DROP TABLE IF EXISTS solicitud_vinculacion;
CREATE TABLE solicitud_vinculacion (
    id_solicitud INT AUTO_INCREMENT PRIMARY KEY,
    id_tutor INT NOT NULL,
    id_jugador INT NOT NULL,
    parentezco VARCHAR(50) NOT NULL,
    estado ENUM('pendiente', 'aceptada', 'rechazada') DEFAULT 'pendiente',
    motivo_rechazo TEXT,
    fecha_solicitud DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_resolucion DATETIME,
    id_admin INT,

    FOREIGN KEY (id_tutor) REFERENCES tutor(id_tutor),
    FOREIGN KEY (id_jugador) REFERENCES jugador(id_jugador),
    FOREIGN KEY (id_admin) REFERENCES administrador(id_administrador)
);



DROP PROCEDURE IF EXISTS registrar_jugador;
DELIMITER $$

CREATE PROCEDURE registrar_jugador(
    IN p_correo VARCHAR(100),
    IN p_contrasena_hash VARCHAR(255),
    IN p_primer_nombre VARCHAR(100),
    IN p_apellidos VARCHAR(150),
    IN p_nombre_usuario VARCHAR(20),
    IN p_fecha_nacimiento DATE
)
BEGIN
    DECLARE v_id_cuenta INT;
    DECLARE v_existe_correo INT DEFAULT 0;
    DECLARE v_existe_usuario INT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT COUNT(*) INTO v_existe_correo
    FROM cuenta
    WHERE correo = p_correo;

    IF v_existe_correo > 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'El correo ya está registrado';
    END IF;

    SELECT COUNT(*) INTO v_existe_usuario
    FROM jugador
    WHERE nombre_usuario = p_nombre_usuario;

    IF v_existe_usuario > 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'El nombre de usuario ya existe';
    END IF;

    INSERT INTO cuenta(correo, contrasena_hash, rol, activo)
    VALUES (p_correo, p_contrasena_hash, 'jugador', TRUE);

    SET v_id_cuenta = LAST_INSERT_ID();

    INSERT INTO jugador(
        primer_nombre,
        apellidos,
        score_global,
        nombre_usuario,
        fecha_nacimiento,
        tutorial_completado,
        cuenta
    )
    VALUES (
        p_primer_nombre,
        p_apellidos,
        0,
        p_nombre_usuario,
        p_fecha_nacimiento,
        FALSE,
        v_id_cuenta
    );

    COMMIT;
END$$

DELIMITER ;



DROP PROCEDURE IF EXISTS registrar_tutor;
DELIMITER $$

CREATE PROCEDURE registrar_tutor(
    IN p_correo VARCHAR(100),
    IN p_contrasena_hash VARCHAR(255),
    IN p_primer_nombre VARCHAR(100),
    IN p_apellidos VARCHAR(150),
    IN p_telefono VARCHAR(25)
)
BEGIN
    DECLARE v_id_cuenta INT;
    DECLARE v_existe_correo INT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT COUNT(*) INTO v_existe_correo
    FROM cuenta
    WHERE correo = p_correo;

    IF v_existe_correo > 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'El correo ya está registrado';
    END IF;


    INSERT INTO cuenta(correo, contrasena_hash, rol, activo)
    VALUES (p_correo, p_contrasena_hash, 'tutor', FALSE);

    SET v_id_cuenta = LAST_INSERT_ID();

    INSERT INTO tutor(
        primer_nombre,
        apellidos,
        telefono,
        cuenta
    )
    VALUES (
        p_primer_nombre,
        p_apellidos,
        p_telefono,
        v_id_cuenta
    );

    COMMIT;
END$$

DELIMITER ;



--SET FOREIGN_KEY_CHECKS = 1;