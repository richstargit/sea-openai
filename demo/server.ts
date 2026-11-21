import app from './app.js'
const port = Number(process.env.PORT || 3030)
app.listen(port, '127.0.0.1', () => console.log('SnapPromo Live • http://127.0.0.1:' + port + '/detect'))
