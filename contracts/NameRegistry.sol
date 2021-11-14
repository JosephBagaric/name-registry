//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";

contract NameRegistry {
    uint256 public waitingPeriod = 60;
    uint256 public registrationDuration = 365 days;
    uint256 public costPerChar = 1 gwei;

    uint256 internal _latestRegistrationId;

    struct Registration {
        address owner;
        uint256 expires;
    }

    struct Refund {
        uint256 amount;
        uint256 unlocks;
    }

    mapping(bytes32 => uint256) private _commitmentsCreated;

    mapping(string => Registration) public registrations;
    mapping(address => Refund) private _refundAvailable;

    // Commitment flow inspired by ENS
    function generateCommitment(
        string memory name,
        bytes32 secret
    ) public view returns(bytes32 commitment, uint256 estimatedCost) {
        bytes32 label = keccak256(bytes(name));

        commitment = keccak256(abi.encodePacked(label, msg.sender, secret));
        estimatedCost = _calculateCost(name);
    }

    function commit(bytes32 commitment) public {
        require(_commitmentsCreated[commitment] < block.timestamp, "Commitment already exists");

        _commitmentsCreated[commitment] = block.timestamp;
    }

    function register(string calldata name, bytes32 secret) public payable {
        require(registrations[name].expires < block.timestamp, "Registration still valid");

        (bytes32 commitment, uint256 cost) = generateCommitment(name, secret);

        require(_commitmentsCreated[commitment] > 0, "Non-existing commitment");
        require(_commitmentsCreated[commitment] < block.timestamp + waitingPeriod, "Waiting period hasn't passed yet");
        require(msg.value >= cost, "Not enough funds to register");

        uint256 expires = block.timestamp + registrationDuration;

        registrations[name] = Registration({
            owner: msg.sender,
            expires: expires
        });

        _refundAvailable[msg.sender] = Refund({
            amount: cost,
            unlocks: expires
        });

        // Refund remainder
        if(msg.value > cost) {
            payable(msg.sender).transfer(msg.value - cost);
        }
    }

    function renew(string calldata name) public payable {
        Registration storage registration = registrations[name];

        require(registration.owner == msg.sender, "Not the owner of current registration");
        require(registration.expires > block.timestamp, "Unable to renew expired registration");

        uint256 cost = _calculateCost(name);
        require(msg.value >= cost, "Not enough funds to renew");

        uint256 newExpiryTime = registration.expires + registrationDuration;

        registration.expires = newExpiryTime;

        Refund storage refund = _refundAvailable[msg.sender];

        refund.amount += cost;
        refund.unlocks = newExpiryTime;

        // Refund remainder
        if(msg.value > cost) {
            payable(msg.sender).transfer(msg.value - cost);
        }
    }

    function withdraw(uint256 amount) public {
        Refund storage refund = _refundAvailable[msg.sender];

        require(refund.amount >= amount, "Not enough funds to refund");
        require(refund.unlocks < block.timestamp, "Refund not unlocked yet");

        refund.amount -= amount;

        payable(msg.sender).transfer(amount);
    }

    function _calculateCost(string memory name) private view returns (uint256) {
        return bytes(name).length * costPerChar;
    }
}
