import express from 'express';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Jhakaas Express server is running!' });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
