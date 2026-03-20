module.exports = {
  apps: [
    {
      name: 'jordan-ai',
      script: 'index.js',
      cwd: 'C:\\Users\\Jordan\\Desktop\\jordan-ai-bot',
      watch: false,
      restart_delay: 5000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        // Force correct Twitter keys — overrides any Windows system env vars
        TWITTER_API_KEY:       'qEcdf6rCmKZlvfUnUUCIVAs0F',
        TWITTER_API_SECRET:    'NFTOe6yiUK1YqDx04SQkxEYBwH127t5ZocRBJ12IxWqtc8skkb',
        TWITTER_ACCESS_TOKEN:  '2034662656234438656-igTXyGou9s2pYTSg4td1YVv0QsR8ax',
        TWITTER_ACCESS_SECRET: 'nShThJdd23V830eoWISp3a6serEcw6Sc1gBIHv6UN7MST',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'C:\\Users\\Jordan\\Desktop\\jordan-ai-bot\\logs\\error.log',
      out_file: 'C:\\Users\\Jordan\\Desktop\\jordan-ai-bot\\logs\\out.log',
    }
  ]
}
