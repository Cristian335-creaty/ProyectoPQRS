const express = require('express');
const mysql = require('mysql');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const config = require('./config');

const app = express();

const db = mysql.createConnection(config);

db.connect(err => {
    if (err) {
        console.error('Error connecting to the database:', err.stack);
        return;
    }
    console.log('Connected to the database');
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true
}));

app.get('/', (req, res) => {
    res.render('index', { nombre: req.session.nombre });
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    const { nombre, email, cedula, password } = req.body;
    if (!nombre || !email || !cedula || !password) {
        return res.send('Todos los campos son obligatorios.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    db.query('SELECT * FROM usuarios WHERE email = ? OR cedula = ?', [email, cedula], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            return res.send('El email o la cédula ya están registrados');
        } else {
            db.query('INSERT INTO usuarios (nombre, email, cedula, contraseña) VALUES (?, ?, ?, ?)', 
                [nombre, email, cedula, hashedPassword], 
                (err, result) => {
                    if (err) throw err;
                    res.redirect('/login');
                });
        }
    });
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { email, contraseña } = req.body;
    db.query('SELECT * FROM usuarios WHERE email = ?', [email], async (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            const user = results[0];
            if (await bcrypt.compare(contraseña, user.contraseña)) {
                req.session.loggedin = true;
                req.session.nombre = user.nombre;
                req.session.userId = user.id;
                req.session.isAdmin = user.is_admin;
                if (user.is_admin) {
                    res.redirect('/admin');
                } else {
                    res.redirect('/');
                }
            } else {
                res.send('Contraseña incorrecta!');
            }
        } else {
            res.send('Usuario no encontrado!');
        }
    });
});

app.get('/admin', (req, res) => {
    if (!req.session.loggedin || !req.session.isAdmin) {
        return res.redirect('/login');
    }
    const query = `
        SELECT pqrssi.*, estados.nombre AS estado_nombre, usuarios.nombre AS usuario_nombre 
        FROM pqrssi 
        JOIN estados ON pqrssi.estado_id = estados.id
        JOIN usuarios ON pqrssi.usuario_id = usuarios.id;
    `;
    db.query(query, (err, results) => {
        if (err) throw err;
        res.render('admin', { solicitudes: results });
    });
});

app.post('/admin/change-status', (req, res) => {
    if (!req.session.loggedin || !req.session.isAdmin) {
        return res.redirect('/login');
    }
    const { pqrssi_id, estado_id, comentario } = req.body;
    const comentarioCompleto = `Estado cambiado por administrador: ${comentario}`;

    console.log('Datos recibidos:', { pqrssi_id, estado_id, comentario });

    db.query('UPDATE pqrssi SET estado_id = ? WHERE id = ?', [estado_id, pqrssi_id], (err) => {
        if (err) throw err;

        db.query('INSERT INTO historial (pqrssi_id, estado_id, comentario) VALUES (?, ?, ?)', 
            [pqrssi_id, estado_id, comentarioCompleto], 
            (err) => {
                if (err) throw err;
                console.log('Comentario almacenado:', comentarioCompleto);
                res.redirect('/admin');
            }
        );
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/submit', (req, res) => {
    if (!req.session.loggedin) {
        return res.redirect('/login');
    }
    db.query('SELECT * FROM categorias', (err, results) => {
        if (err) throw err;
        res.render('submit', { categorias: results });
    });
});

app.get('/recover', (req, res) => {
    res.render('recover');
});

app.post('/recover', async (req, res) => {
    const { cedula, newPassword } = req.body;

    if (!cedula || !newPassword) {
        return res.send('Todos los campos son obligatorios.');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    db.query('SELECT * FROM usuarios WHERE cedula = ?', [cedula], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            return res.send('La cédula no está registrada');
        } else {
            db.query('UPDATE usuarios SET contraseña = ? WHERE cedula = ?', [hashedPassword, cedula], (err, result) => {
                if (err) throw err;
                res.redirect('/login'); // Redirige a la página de inicio de sesión después de la recuperación
            });
        }
    });
});


app.post('/submit', (req, res) => {
    if (!req.session.loggedin) {
        return res.redirect('/login');
    }
    const { tipo, descripcion, categoria_id } = req.body;
    const usuario_id = req.session.userId;
    const estado_id = 1;

    db.query('SELECT id FROM categorias WHERE id = ?', [categoria_id], (err, results) => {
        if (err) throw err;

        if (results.length === 0) {
            return res.send('La categoría especificada no existe.');
        }

        db.query('INSERT INTO pqrssi (tipo, descripcion, usuario_id, categoria_id, estado_id) VALUES (?, ?, ?, ?, ?)', 
            [tipo, descripcion, usuario_id, categoria_id, estado_id], 
            (err, result) => {
                if (err) throw err;

                const pqrssi_id = result.insertId;

                db.query('INSERT INTO historial (pqrssi_id, estado_id, comentario) VALUES (?, ?, ?)', 
                    [pqrssi_id, estado_id, 'Solicitud creada'], 
                    (err) => {
                        if (err) throw err;
                        res.redirect('/');
                    }
                );
            }
        );
    });
});

app.get('/view', (req, res) => {
    if (!req.session.loggedin) {
        return res.redirect('/login');
    }
    db.query(`
        SELECT p.id, p.tipo, p.descripcion, e.nombre AS estado, p.fecha, c.nombre AS categoria, u.nombre AS usuario
        FROM pqrssi p
        JOIN estados e ON p.estado_id = e.id
        JOIN categorias c ON p.categoria_id = c.id
        JOIN usuarios u ON p.usuario_id = u.id
    `, (err, results) => {
        if (err) throw err;
        res.render('view', { pqrssi: results });
    });
});

app.get('/historial/:pqrssi_id', (req, res) => {
    if (!req.session.loggedin) {
        return res.redirect('/login');
    }
    const pqrssi_id = req.params.pqrssi_id;

    db.query(`
        SELECT h.id, h.fecha, e.nombre AS estado, h.comentario
        FROM historial h
        JOIN estados e ON h.estado_id = e.id
        WHERE h.pqrssi_id = ?
    `, [pqrssi_id], (err, results) => {
        if (err) throw err;
        res.render('historial', { historial: results });
    });
});

app.listen(3000, () => {
    console.log('Server running on port 3000');
});
