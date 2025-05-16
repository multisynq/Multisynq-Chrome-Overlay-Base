const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    contentScript: './src/contentScript.js',
    syncOverlay:   './src/syncOverlay.js',
    popup:         './src/popup.js',
    background:    './src/background.js'
  },
  output: {
    path:     path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  optimization: {
    minimize: false
  },
  resolve: {
    fallback: {
      crypto:  require.resolve('crypto-browserify'),
      stream:  require.resolve('stream-browserify'),
      buffer:  require.resolve('buffer/'),
      process: require.resolve('process/browser'),
      vm: false
    }
  },
  module: {
    rules: [{
      test: /\.js$/,
      exclude: /node_modules/,
      use: 'babel-loader'
    }]
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer:  ['buffer', 'Buffer'],
      process: 'process/browser'
    }),
    new CopyPlugin({
        patterns: [
          { from: 'manifest.json', to: '' },
          { from: 'overlay.css',   to: '' },
          { from: 'popup.html',    to: '' },
          { from: 'icons',         to: 'icons' }
        ]
      })  
  ]
};
