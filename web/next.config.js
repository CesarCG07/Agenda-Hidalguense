/** @type {import('next').NextConfig} */
// Exporta un sitio 100% estático (carpeta "out"): se puede alojar en cualquier hosting gratuito.
module.exports = { reactStrictMode: true, output: 'export', images: { unoptimized: true } };
