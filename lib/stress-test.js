const puppeteer = require("puppeteer");
const _ = require("lodash/fp");
const username = require("./username");

const initClient = async (
  browser,
  logger,
  joinUrl,
  webcam = false,
  microphone = false
) => {
  const page = await browser.newPage();
  try {
    await page.goto(joinUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    const audioAction = microphone ? "Microphone" : "Listen only";
    logger.debug(`waiting for audio prompt ([aria-label="${audioAction}"])`);
    await page.waitForSelector(`[aria-label="${audioAction}"]`, { timeout: 30000 });
    logger.debug(`click on ${audioAction}`);
    await page.click(`[aria-label="${audioAction}"]`);
    
    await page.waitForSelector(".ReactModal__Overlay", { hidden: true, timeout: 30000 });
    if (microphone) {
      logger.debug("Ensure that we are not muted...");
      await page.waitForSelector('[aria-label="Mute"],[aria-label="Unmute"]', { timeout: 30000 });
      const unmuteButton = await page.$('[aria-label="Unmute"]');
      if (unmuteButton !== null) {
        logger.debug("clicking on unmute button");
        await unmuteButton.click();
      }
    }
    if (webcam) {
      await page.waitForSelector('[aria-label="Share webcam"]', { timeout: 30000 });
      await page.click('[aria-label="Share webcam"]');
      logger.debug("clicked on sharing webcam");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await page.waitForSelector("#setCam > option", { timeout: 30000 });
      await page.waitForSelector('[aria-label="Start sharing"]', { timeout: 30000 });
      logger.debug("clicking on start sharing");
      await page.click('[aria-label="Start sharing"]');
    }
    return page;
  } catch (err) {
    logger.error(`Error in initClient: ${err.message}`);
    await page.close();
    throw err;
  }
};

const generateClientConfig = (webcam = false, microphone = false) => {
  return {
    username: username.getRandom(),
    webcam,
    microphone,
  };
};

async function start(
  bbbClient,
  logger,
  meetingID,
  testDuration,
  clientWithCamera,
  clientWithMicrophone,
  clientListening
) {
  const [browser, meetingPassword] = await Promise.all([
    puppeteer.launch({
      executablePath: "google-chrome-unstable",
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--mute-audio",
      ],
      headless: true, // Make sure it's running headless to save resources
    }),
    bbbClient.getModeratorPassword(meetingID),
  ]);

  const clientsConfig = [
    ...[...Array(clientWithCamera)].map(() => generateClientConfig(true, true)),
    ...[...Array(clientWithMicrophone)].map(() =>
      generateClientConfig(false, true)
    ),
    ...[...Array(clientListening)].map(() =>
      generateClientConfig(false, false)
    ),
  ];

  // Concurrency control - Launching clients in parallel
  await Promise.all(clientsConfig.map(async (config, idx) => {
    try {
      logger.info(`${config.username} join the conference`);
      await initClient(
        browser,
        logger,
        bbbClient.getJoinUrl(
          config.username,
          meetingID,
          meetingPassword
        ),
        config.webcam,
        config.microphone
      );
    } catch (err) {
      logger.error(`Client ${config.username} failed to initialize: ${err.message}`);
    }
  }));

  logger.info("All users joined the conference");
  logger.info(`Sleeping ${testDuration}s`);
  await new Promise((resolve) => setTimeout(resolve, testDuration * 1000));
  logger.info("Test finished");

  await browser.close();
}

module.exports = {
  start,
};
