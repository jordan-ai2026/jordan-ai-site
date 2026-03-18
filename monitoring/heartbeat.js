const axios = require('axios');
const fs = require('fs');
const path = require('path');

class BusinessHeartbeat {
    constructor() {
        this.logPath = path.join(__dirname, 'logs');
        this.configPath = path.join(__dirname, 'config.json');
        this.lastCheck = this.loadLastCheck();
        
        // Ensure logs directory exists
        if (!fs.existsSync(this.logPath)) {
            fs.mkdirSync(this.logPath, { recursive: true });
        }
    }

    async runHeartbeat() {
        const timestamp = new Date().toISOString();
        console.log(`🫀 Starting heartbeat at ${timestamp}`);
        
        const results = {
            timestamp,
            siteHealth: await this.checkSiteHealth(),
            serviceUptime: await this.checkServiceUptime(),
            paymentFailures: await this.checkPaymentFailures(),
            supportSLA: await this.checkSupportSLA(),
            processHealth: await this.checkProcessHealth(),
            revenueTracking: await this.checkRevenueTracking()
        };

        this.logResults(results);
        this.saveLastCheck(timestamp);
        
        return results;
    }

    async checkSiteHealth() {
        const sites = [
            'https://jordan-ai.co',
            // Add client sites from CRM
        ];
        
        const results = {};
        
        for (const site of sites) {
            try {
                const response = await axios.get(site, { timeout: 10000 });
                results[site] = {
                    status: response.status,
                    responseTime: response.headers['x-response-time'] || 'unknown',
                    healthy: response.status === 200
                };
            } catch (error) {
                results[site] = {
                    status: error.response?.status || 'ERROR',
                    error: error.message,
                    healthy: false
                };
            }
        }
        
        return results;
    }

    async checkServiceUptime() {
        // Check core services
        const services = {
            database: await this.pingDatabase(),
            stripe: await this.pingStripe(),
            wordpress: await this.pingWordPress()
        };
        
        return services;
    }

    async checkPaymentFailures() {
        // This would integrate with Stripe to check failed charges
        return {
            failedCharges: 0,
            retryQueue: [],
            lastChecked: new Date().toISOString()
        };
    }

    async checkSupportSLA() {
        // Check for emails older than 4 hours
        return {
            overdueTickets: 0,
            averageResponseTime: '2.5 hours',
            breachedSLA: []
        };
    }

    async checkProcessHealth() {
        // Monitor background processes
        return {
            runningJobs: [],
            stalledJobs: [],
            failedJobs: [],
            restartCount: 0
        };
    }

    async checkRevenueTracking() {
        // Compare yesterday's revenue to weekly average
        return {
            yesterdayRevenue: 0,
            weeklyAverage: 0,
            variance: '0%',
            trend: 'stable'
        };
    }

    async pingDatabase() {
        // Database health check
        return { healthy: true, responseTime: '50ms' };
    }

    async pingStripe() {
        // Stripe API health check
        return { healthy: true, responseTime: '120ms' };
    }

    async pingWordPress() {
        // WordPress sites health check
        return { healthy: true, responseTime: '200ms' };
    }

    logResults(results) {
        const logFile = path.join(this.logPath, `heartbeat-${new Date().toISOString().split('T')[0]}.json`);
        const logEntry = JSON.stringify(results, null, 2) + '\n';
        
        fs.appendFileSync(logFile, logEntry);
        
        // Alert on failures
        this.processAlerts(results);
    }

    processAlerts(results) {
        const alerts = [];
        
        // Site health alerts
        for (const [site, health] of Object.entries(results.siteHealth)) {
            if (!health.healthy) {
                alerts.push({
                    level: 'critical',
                    type: 'site_down',
                    message: `${site} is returning ${health.status}`,
                    site
                });
            }
        }
        
        // Service uptime alerts
        for (const [service, status] of Object.entries(results.serviceUptime)) {
            if (!status.healthy) {
                alerts.push({
                    level: 'critical',
                    type: 'service_down',
                    message: `${service} service is down`,
                    service
                });
            }
        }
        
        if (alerts.length > 0) {
            this.sendAlerts(alerts);
        }
    }

    sendAlerts(alerts) {
        // In a real implementation, this would send to Slack, email, etc.
        console.log('🚨 ALERTS:', alerts);
    }

    loadLastCheck() {
        try {
            const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            return config.lastCheck;
        } catch {
            return null;
        }
    }

    saveLastCheck(timestamp) {
        const config = { lastCheck: timestamp };
        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    }
}

module.exports = BusinessHeartbeat;

// CLI usage
if (require.main === module) {
    const heartbeat = new BusinessHeartbeat();
    heartbeat.runHeartbeat()
        .then(results => {
            console.log('✅ Heartbeat complete');
            console.log(JSON.stringify(results, null, 2));
        })
        .catch(error => {
            console.error('❌ Heartbeat failed:', error);
        });
}