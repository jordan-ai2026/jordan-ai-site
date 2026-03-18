const cron = require('node-cron');
const BusinessHeartbeat = require('./heartbeat');

class BusinessMonitor {
    constructor() {
        this.heartbeat = new BusinessHeartbeat();
        this.isRunning = false;
    }

    start() {
        console.log('🚀 Starting business monitor...');
        
        // Critical checks every 5 minutes
        cron.schedule('*/5 * * * *', async () => {
            if (!this.isRunning) {
                this.isRunning = true;
                try {
                    const results = await this.heartbeat.runHeartbeat();
                    console.log(`✅ Heartbeat completed at ${results.timestamp}`);
                } catch (error) {
                    console.error('❌ Heartbeat failed:', error);
                } finally {
                    this.isRunning = false;
                }
            }
        });

        // Revenue tracking once daily at 9 AM
        cron.schedule('0 9 * * *', async () => {
            await this.generateDailyReport();
        });

        console.log('✅ Monitor started. Heartbeat every 5 minutes.');
    }

    async generateDailyReport() {
        console.log('📊 Generating daily business report...');
        
        // This would integrate with our existing business status tools
        const report = {
            timestamp: new Date().toISOString(),
            revenue: await this.getYesterdayRevenue(),
            siteHealth: await this.heartbeat.checkSiteHealth(),
            supportMetrics: await this.heartbeat.checkSupportSLA(),
            trends: await this.analyzeTrends()
        };

        console.log('Daily Report:', JSON.stringify(report, null, 2));
        return report;
    }

    async getYesterdayRevenue() {
        // Integration point with billing system
        return {
            amount: 0,
            currency: 'USD',
            transactions: 0
        };
    }

    async analyzeTrends() {
        // Analyze patterns over time
        return {
            revenueGrowth: '0%',
            sitePerformance: 'stable',
            supportLoad: 'normal'
        };
    }

    stop() {
        console.log('⏹️  Stopping business monitor...');
        // Cleanup scheduled tasks
    }
}

// CLI usage
if (require.main === module) {
    const monitor = new BusinessMonitor();
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n👋 Shutting down monitor...');
        monitor.stop();
        process.exit(0);
    });
    
    monitor.start();
}

module.exports = BusinessMonitor;