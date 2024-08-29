const puppeteer = require("puppeteer");
const _ = require("lodash/fp");
const username = require("./username");

const MAX_CONCURRENT_CLIENTS = 10; // Number of clients to initialize in parallel

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
  } catch (err) {
    logger.error(`Error in initClient: ${err.message}`);
    await page.close();
    throw err;
  }
  return page;
};

const generateClientConfig = (webcam = false, microphone = false) => {
  return {
    username: username.getRandom(),
    webcam,
    microphone,
  };
};

const start = async (
  bbbClient,
  logger,
  meetingID,
  testDuration,
  clientWithCamera,
  clientWithMicrophone,
  clientListening
) => {
  const [browser, meetingPassword] = await Promise.all([
    puppeteer.launch({
      executablePath: "google-chrome-unstable",
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--mute-audio",
      ],
      headless: true,
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

  for (let i = 0; i < clientsConfig.length; i += MAX_CONCURRENT_CLIENTS) {
    const batch = clientsConfig.slice(i, i + MAX_CONCURRENT_CLIENTS);

    await Promise.all(
      batch.map((config) =>
        initClient(
          browser,
          logger,
          bbbClient.getJoinUrl(config.username, meetingID, meetingPassword),
          config.webcam,
          config.microphone
        ).catch((err) => {
          logger.error(
            `Unable to initialize client ${config.username}: ${err.message}`
          );
          return null;
        })
      )
    );
    logger.info(`Batch ${Math.ceil(i / MAX_CONCURRENT_CLIENTS) + 1} completed.`);
  }

  logger.info("All users joined the conference");
  logger.info(`Sleeping for ${testDuration}s`);
  await new Promise((resolve) => setTimeout(resolve, testDuration * 1000));
  logger.info("Test finished");
  await browser.close();
};

module.exports = {
  start,
};
