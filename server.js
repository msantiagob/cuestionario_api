// server.js simplificado
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();

const corsOptions = {
  origin: ['https://cuestionario.sonmyd.com', 'http://localhost:3000', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
};

// Middleware
app.use(cors(corsOptions));// Aumentar el límite de tamaño para JSON
app.use(bodyParser.json({ limit: '10mb' }));

// Configuración de la conexión a PostgreSQL
const pool = new Pool({
  connectionString:
    'postgresql://postgres:CYHiYyuQuEJWZUHGwntzqXFBcCHekWEw@caboose.proxy.rlwy.net:57142/railway',
});

// Verificar conexión a la base de datos
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error de conexión a PostgreSQL:', err);
  } else {
    console.log('Conexión a PostgreSQL establecida exitosamente');

    // Crear la tabla si no existe
    createTablesIfNotExist();
  }
});

// Función para crear las tablas necesarias
async function createTablesIfNotExist() {
  try {
    // Crear tabla encuestas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS encuestas (
        id SERIAL PRIMARY KEY,
        fecha TIMESTAMP NOT NULL,
        respuestas JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla contactos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contactos (
        id SERIAL PRIMARY KEY,
        encuesta_id INTEGER REFERENCES encuestas(id),
        nombre TEXT NOT NULL,
        telefono TEXT NOT NULL,
        compartio TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Tablas creadas o verificadas correctamente');
  } catch (error) {
    console.error('Error al crear tablas:', error);
  }
}

// Endpoint para guardar la encuesta (versión simplificada)
app.post('/api/guardar-encuesta', async (req, res) => {
  console.log('Recibiendo solicitud para guardar encuesta...');

  const client = await pool.connect();

  try {
    // Iniciar transacción
    await client.query('BEGIN');

    const { respuestas, contacto, fecha } = req.body;

    console.log('Datos recibidos:', {
      respuestasLength: respuestas?.length,
      contactoRecibido: !!contacto
    });

    // Guardar toda la encuesta con las respuestas como JSON
    const encuestaResult = await client.query(
      'INSERT INTO encuestas (fecha, respuestas) VALUES ($1, $2) RETURNING id',
      [fecha, JSON.stringify(respuestas)]
    );

    const encuestaId = encuestaResult.rows[0].id;
    console.log(`Encuesta guardada con ID: ${encuestaId}`);

    // Insertar contacto si existe
    if (contacto && contacto.nombre && contacto.telefono) {
      console.log('Guardando información de contacto');

      await client.query(
        'INSERT INTO contactos (encuesta_id, nombre, telefono, compartio) VALUES ($1, $2, $3, $4)',
        [
          encuestaId,
          contacto.nombre,
          contacto.telefono,
          contacto.compartio || '',
        ]
      );

      console.log('Contacto guardado correctamente');
    }

    // Confirmar transacción
    await client.query('COMMIT');
    console.log('Transacción completada exitosamente');

    res.status(201).json({
      success: true,
      message: 'Encuesta guardada exitosamente',
      encuestaId,
    });
  } catch (error) {
    // Revertir transacción en caso de error
    await client.query('ROLLBACK');
    console.error('Error al guardar la encuesta:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al guardar la encuesta',
      error: error.message,
    });
  } finally {
    // Liberar el cliente
    client.release();
  }
});

// Endpoint para obtener estadísticas
app.get('/api/estadisticas', async (req, res) => {
  try {
    const totalEncuestas = await pool.query('SELECT COUNT(*) FROM encuestas');
    const totalContactos = await pool.query('SELECT COUNT(*) FROM contactos');

    // Ejemplo de cómo contar respuestas específicas usando JSON
    const respuestasEjemplo = await pool.query(`
      SELECT id, fecha, respuestas
      FROM encuestas
      ORDER BY fecha DESC
      LIMIT 5
    `);

    res.json({
      totalEncuestas: totalEncuestas.rows[0].count,
      totalContactos: totalContactos.rows[0].count,
      respuestasRecientes: respuestasEjemplo.rows,
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// Puerto
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
