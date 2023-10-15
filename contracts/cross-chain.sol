// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);

    function transferFrom(
        address from,
        address to,
        uint256 value
    ) external returns (bool);
}

contract CrossChainBridge {
    address public owner;
    uint256 public ratio = 50;
    uint256 public gasPrice = 0;
    uint256 public feesPercentage = 10;

    mapping(address => uint256) public deposits;

    event CrossChainTransferIn(
        uint256 chainId,
        address indexed walletAddress,
        address indexed tokenAddress,
        uint256 amount,
        uint256 fees
    );

    event CrossChainTransferOut(
        bytes32 indexed originTxHash,
        uint256 indexed originChainId,
        address indexed walletAddress,
        address tokenAddress,
        uint256 amount
    );

    event Deposit(address indexed depositer, uint256 amount);
    event Withdraw(address indexed caller, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the contract owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        // Default values can be set here if needed
    }

    function setRatio(uint256 _ratio) external onlyOwner {
        ratio = _ratio;
    }

    function setGasPrice(uint256 _gasPrice) external onlyOwner {
        gasPrice = _gasPrice;
    }

    function setFeesPercentage(uint256 _feesPercentage) external onlyOwner {
        require(_feesPercentage <= 10000, "Invalid percentage");
        feesPercentage = _feesPercentage;
    }

    function getFees(
        address tokenAddress,
        uint256 amount
    ) public view returns (uint256) {
        uint256 gas;
        if (tokenAddress == address(0)) {
            // Native token
            gas = 21000; // Typical gas for native Ether transfer
        } else {
            // ERC20 token
            gas = 80000; // This is an estimate for ERC20 transfers and might need adjustment.
        }
        return ((amount * feesPercentage) / 10000) + (gas * gasPrice);
    }

    function crossChainTransferIn(
        uint256 chainId,
        address tokenAddress,
        uint256 amount
    ) external payable {
        uint256 fees = getFees(tokenAddress, amount);

        if (tokenAddress == address(0)) {
            // Native token
            require(msg.value == amount, "Sent value mismatch");
        }

        // Fees distribution logic here...

        emit CrossChainTransferIn(
            chainId,
            msg.sender,
            tokenAddress,
            amount,
            fees
        );
    }

    function crossChainTransferOut(
        bytes32 originTxHash,
        uint256 originChainId,
        address tokenAddress,
        address toWallet,
        uint256 amount
    ) external onlyOwner {
        if (tokenAddress == address(0)) {
            // Native token
            payable(toWallet).transfer(amount);
        } else {
            // ERC20 token
            require(
                IERC20(tokenAddress).transfer(toWallet, amount),
                "Transfer failed"
            );
        }

        // Fees distribution logic here...

        emit CrossChainTransferOut(
            originTxHash,
            originChainId,
            toWallet,
            tokenAddress,
            amount
        );
    }

    function deposit(address tokenAddress, uint256 amount) external payable {
        deposits[msg.sender] += amount;

        if (tokenAddress == address(0)) {
            // Native token
            require(
                msg.value >= amount,
                "Sent value is less than specified amount"
            );

            uint256 refundAmount = msg.value - amount;
            if (refundAmount > 0) {
                payable(msg.sender).transfer(refundAmount); // Refund excess value
            }
        } else {
            // ERC20 token
            require(
                IERC20(tokenAddress).transferFrom(
                    msg.sender,
                    address(this),
                    amount
                ),
                "Transfer failed"
            );
        }

        emit Deposit(msg.sender, amount);
    }

    function withdraw(address tokenAddress, uint256 amount) external {
        require(deposits[msg.sender] >= amount, "Insufficient deposited funds");

        deposits[msg.sender] -= amount;

        if (tokenAddress == address(0)) {
            // Native token
            payable(msg.sender).transfer(amount);
        } else {
            // ERC20 token
            require(
                IERC20(tokenAddress).transfer(msg.sender, amount),
                "Transfer failed"
            );
        }

        emit Withdraw(msg.sender, amount);
    }
}

// fenmu = 100

// A fenzi = 1 * 100 = 100

// somebody swap

// fenmu = 99.998
// A = 100 / 99.998 = 1.0000200004

// B deposit
// B fenzi = 10 * 99.998 = 999.98

// somebody swap
// fenmu = 99.996

// A = 100  / 99.996 = 1.0000400016
// B = 999.98 / 99.996 = 10.000200008

// total fenzi / fenmu = total deposit

// total fenzi / (fenmu - y) = (total deposit + x)
// 如果现在 增加了 100 fee
// x = 100
