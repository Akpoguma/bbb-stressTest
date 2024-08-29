const puppeteer = require("puppeteer");
const _ = require("lodash/fp");
const username = require("./username");

const RETRY_LIMIT = 3; // Number of retries for critical steps
const RETRY_DELAY = 5000; // Delay between retries in milliseconds

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
    logger.debug(`Waiting for audio prompt ([aria-label="${audioAction}"])`);
    await page.waitForSelector(`[aria-label="${audioAction}"]`, { timeout: 60000 });

    logger.debug(`Clicking on ${audioAction}`);
    await page.click(`[aria-label="${audioAction}"]`);

    // Retry logic for waiting for the overlay to disappear
    let overlayHidden = false;
    for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
      try {
        await page.waitForSelector(".ReactModal__Overlay", { hidden: true, timeout: 20000 });
        overlayHidden = true;
        break;
      } catch (err) {
        logger.debug(`Attempt ${attempt} to wait for overlay to disappear failed.`);
        if (attempt < RETRY_LIMIT) {
          logger.debug(`Retrying after ${RETRY_DELAY / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
      }
    }

    if (!overlayHidden) {
      throw new Error('Overlay failed to disappear after multiple attempts');
    }

    if (microphone) {
      logger.debug("Ensure that we are not muted...");
      await page.waitForSelector('[aria-label="Mute"],[aria-label="Unmute"]', { timeout: 60000 });
      const unmuteButton = await page.$('[aria-label="Unmute"]');
      if (unmuteButton !== null) {
        logger.debug("Clicking on unmute button");
        await unmuteButton.click();
      }
    }

    if (webcam) {
      logger.debug("Waiting to share webcam...");
      await page.waitForSelector('[aria-label="Share webcam"]', { timeout: 60000 });
      await page.click('[aria-label="Share webcam"]');

      logger.debug("Clicked on sharing webcam. Waiting for options...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await page.waitForSelector("#setCam > option", { timeout: 60000 });

      logger.debug("Clicking on start sharing");
      await page.click('[aria-label="Start sharing"]');
    }

    return Promise.resolve(page);

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

  for (let idx = 0; idx < clientsConfig.length; idx++) {
    const clientConfig = clientsConfig[idx];
    logger.info(`${clientConfig.username} join the conference`);

    try {
      await initClient(
        browser,
        logger,
        bbbClient.getJoinUrl(clientConfig.username, meetingID, meetingPassword),
        clientConfig.webcam,
        clientConfig.microphone
      );
      logger.info(`Client ${clientConfig.username} joined successfully`);
    } catch (err) {
      logger.error(`Unable to initialize client ${clientConfig.username}: ${err.message}`);
    }

    // Adding a slight delay between clients to reduce server load
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  logger.info("All users joined the conference");
  logger.info(`Sleeping ${testDuration}s`);
  await new Promise((resolve) => setTimeout(resolve, testDuration * 1000));
  logger.info("Test finished");

  await browser.close();
}

module.exports = {
  start,
};
