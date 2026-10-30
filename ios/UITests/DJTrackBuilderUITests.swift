import XCTest

/// Tests the real app entry point and its navigable controls on an iOS simulator.
/// These checks intentionally avoid assuming sound hardware, signed builds,
/// Apple Music access, or source audio that was never imported.
final class DJTrackBuilderUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 20),
                      "The app failed to reach the foreground")
    }

    override func tearDownWithError() throws {
        if let app, app.state == .runningForeground { app.terminate() }
    }

    func testLaunchDecksAndTransportAreVisible() throws {
        XCTAssertTrue(app.buttons["Play Deck A"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["Play Deck B"].exists)
        XCTAssertTrue(app.sliders["Crossfader: A to B"].exists)
        XCTAssertTrue(app.buttons["Load audio to Deck A"].exists)
        XCTAssertTrue(app.buttons["Load audio to Deck B"].exists)
        XCTAssertTrue(app.buttons["Deck A SYNC"].exists)
        XCTAssertFalse(app.buttons["Deck A SYNC"].isEnabled,
                       "Imported song tempo SYNC must not appear working")
        XCTAssertTrue(app.buttons["Deck B SYNC"].exists)
        snapshot("01-wave-initial")
    }

    func testAllFiveModesAndAutoScreenNavigate() throws {
        let modes = ["MIX", "STEMS", "BUILDER", "FX", "WAVE"]
        for mode in modes {
            let button = app.buttons[mode]
            XCTAssertTrue(button.exists, "Missing navigation mode: \(mode)")
            button.tap()
            XCTAssertTrue(app.buttons["Play Deck A"].exists)
            XCTAssertTrue(app.buttons["Play Deck B"].exists)
            snapshot("02-\(mode.lowercased())")
        }
        let auto = app.buttons["Open Pattern AutoMix"]
        XCTAssertTrue(auto.exists)
        auto.tap()
        XCTAssertTrue(app.staticTexts["MIXAUTO / PHRASE PLAN"].waitForExistence(timeout: 5))
        snapshot("03-auto")
    }

    func testWaveformAndEmptyFileCueState() throws {
        XCTAssertTrue(app.otherElements["Deck A waveform"].exists ||
                      app.staticTexts["PCM SIGNAL OVERVIEW · ORIGINAL PATTERNS"].exists)
        // Cues are intentionally file-only: the first launch contains only
        // original pattern decks, so there is no position to store or jump to.
        XCTAssertFalse(app.buttons["Deck A hot cue 1: set"].exists)
        XCTAssertFalse(app.buttons["Deck A hot cue 5: set"].exists)
        snapshot("04-empty-file-cues")
    }

    func testLandscapeKeepsBothDeckTransportsReachable() throws {
        XCUIDevice.shared.orientation = .landscapeLeft
        defer { XCUIDevice.shared.orientation = .portrait }
        XCTAssertTrue(app.buttons["Play Deck A"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Play Deck A"].isHittable)
        XCTAssertTrue(app.buttons["Play Deck B"].isHittable)
        XCTAssertTrue(app.sliders["Crossfader: A to B"].isHittable)
        XCTAssertTrue(app.buttons["Load audio to Deck A"].isHittable)
        XCTAssertTrue(app.buttons["Load audio to Deck B"].isHittable)
        snapshot("05-landscape-cockpit")
    }

    private func snapshot(_ name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
