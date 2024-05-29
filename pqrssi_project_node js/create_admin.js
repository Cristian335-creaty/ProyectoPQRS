const mysql = require('mysql'); // Importa el módulo mysql
const bcrypt = require('bcrypt'); // Importa el módulo bcrypt para el hash de contraseñas
const config = require('./config'); // Importa el archivo config.js para las credenciales de la base de datos

// Crea una conexión a la base de datos utilizando la configuración proporcionada en el archivo config.js
const db = mysql.createConnection(config);

// Conecta a la base de datos
db.connect(err => {
    if (err) {
        console.error('Error connecting to the database:', err.stack);
        return;
    }
    console.log('Connected to the database'); // Mensaje de confirmación de conexión exitosa

    const nombre = 'AdminS'; // Nombre del nuevo administrador
    const email = 'adminSuper@usta.com'; // Email del nuevo administrador
    const contraseña = '321'; // Contraseña del nuevo administrador (recuerda cambiarla por una segura)

    // Genera un hash de la contraseña utilizando bcrypt
    bcrypt.hash(contraseña, 10, (err, hashedPassword) => {
        if (err) {
            console.error('Error hashing the password:', err);
            return;
        }

        // Query para insertar el nuevo administrador en la tabla 'usuarios'
        const query = 'INSERT INTO usuarios (nombre, email, cedula, contraseña, is_admin) VALUES (?, ?, ?, ?, ?)';
        const values = [nombre, email, hashedPassword, true]; // Valores a insertar en la consulta SQL

        // Ejecuta la consulta SQL para insertar el nuevo administrador
        db.query(query, values, (err, result) => {
            if (err) {
                console.error('Error inserting the admin user:', err);
                return;
            }
            console.log('Admin user created successfully'); // Mensaje de confirmación de creación exitosa del nuevo administrador
            db.end(); // Cierra la conexión a la base de datos
        });
    });
});
